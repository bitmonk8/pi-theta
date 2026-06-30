import { describe, expect, it } from "vitest";
import {
  checkByClause,
  checkDiscriminatedUnion,
  detectTypeAliasCycles,
} from "../src/parser/schema-declarations";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";

// V5b-T — failing tests for the paired `V5b` "discriminated unions, recursion,
// and cycle detection" implementation.
//
// Spec: schemas.md (§Discriminated unions — implicit detection with the
// non-string / ambiguous / missing / duplicate-value / nested-discriminator
// rejections, and the `by`-on-object-schema rejection; §Recursion — the
// type-alias-cycle rule where a pure-alias cycle is rejected but a cycle
// through at least one object-schema hop remains legal).
//
// The discriminator and cycle checks need the resolved declaration graph
// (per-variant field literals, the explicit `by` field, alias-vs-object node
// kinds) the tokeniser does not carry, so they are asserted against the
// standalone `checkDiscriminatedUnion` / `checkByClause` / `detectTypeAliasCycles`
// seams (src/parser/schema-declarations.ts).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V5b discriminated-union / cycle checker is
// absent: every seam is an inert stub returning no diagnostics. Each test reds
// on its own primary assertion (an absent expected diagnostic), not on a
// compile error, missing fixture, or harness throw.

/** A throwaway 1:1–1:2 span for the seam calls. */
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

// --- schemas.md §Discriminated unions — non-string discriminator ----------

describe("V5b-T — non-string discriminator (loom/parse/non-string-discriminator)", () => {
  it("loom/parse/non-string-discriminator: an otherwise-qualifying field with a numeric literal fires with the offending kind", () => {
    // `schema Animal = Cat | Dog` where each variant's `kind` is an integer
    // literal (`kind: 1` / `kind: 2`) — present in every variant, single
    // literal, unique value, but the literal type is integer not string.
    const diags = checkDiscriminatedUnion(
      {
        name: "Animal",
        variants: [
          { name: "Cat", fields: [{ name: "kind", literal: { kind: "integer", text: "1" } }] },
          { name: "Dog", fields: [{ name: "kind", literal: { kind: "integer", text: "2" } }] },
        ],
      },
      site(),
    );
    const d = withCode(diags, "loom/parse/non-string-discriminator");
    expect(d, "loom/parse/non-string-discriminator for an integer discriminator").toBeDefined();
    // Message template `discriminator '<field>' on <X> must be a string-literal
    // type; got <kind>` from code-registry-parse.md; <kind> is the offending
    // literal's type-kind.
    expect(d?.message).toBe(
      "discriminator 'kind' on Animal must be a string-literal type; got integer",
    );
  });
});

// --- schemas.md §Discriminated unions — ambiguous discriminator -----------

describe("V5b-T — ambiguous discriminator (loom/parse/ambiguous-discriminator)", () => {
  it("loom/parse/ambiguous-discriminator: two qualifying fields fire, naming the candidates", () => {
    // Both `kind` and `species` qualify (present in every variant, single
    // string literal, unique values) — detection is ambiguous.
    const diags = checkDiscriminatedUnion(
      {
        name: "Animal",
        variants: [
          {
            name: "Cat",
            fields: [
              { name: "kind", literal: { kind: "string", text: "cat" } },
              { name: "species", literal: { kind: "string", text: "feline" } },
            ],
          },
          {
            name: "Dog",
            fields: [
              { name: "kind", literal: { kind: "string", text: "dog" } },
              { name: "species", literal: { kind: "string", text: "canine" } },
            ],
          },
        ],
      },
      site(),
    );
    const d = withCode(diags, "loom/parse/ambiguous-discriminator");
    expect(d, "loom/parse/ambiguous-discriminator for two qualifying fields").toBeDefined();
    // Message from schemas.md §Discriminated unions / code-registry-parse.md;
    // candidates are the qualifying fields in source order, comma-space joined.
    expect(d?.message).toBe(
      "ambiguous discriminator for Animal; candidates: kind, species. Declare explicitly with 'by <field>'.",
    );
  });
});

// --- schemas.md §Discriminated unions — missing discriminator -------------

describe("V5b-T — missing discriminator (loom/parse/missing-discriminator)", () => {
  it("loom/parse/missing-discriminator: a union of object schemas with no shared single-literal field fires", () => {
    // No field is present in every variant as a single literal — `name` and
    // `age` are non-literal fields on disjoint variants.
    const diags = checkDiscriminatedUnion(
      {
        name: "Animal",
        variants: [
          { name: "Cat", fields: [{ name: "name" }] },
          { name: "Dog", fields: [{ name: "age" }] },
        ],
      },
      site(),
    );
    const d = withCode(diags, "loom/parse/missing-discriminator");
    expect(d, "loom/parse/missing-discriminator for a discriminator-less object union").toBeDefined();
    // Message from schemas.md §Discriminated unions / code-registry-parse.md.
    expect(d?.message).toBe(
      "Animal is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'.",
    );
  });
});

// --- schemas.md §Discriminated unions — duplicate discriminator value -----

describe("V5b-T — duplicate discriminator value (loom/parse/duplicate-discriminator-value)", () => {
  it("loom/parse/duplicate-discriminator-value: two variants sharing the discriminator value fire", () => {
    // Explicit `by kind`: both variants carry `kind: "same"` — the chosen
    // discriminator's value is not unique across the union.
    const diags = checkDiscriminatedUnion(
      {
        name: "Animal",
        by: "kind",
        variants: [
          { name: "Cat", fields: [{ name: "kind", literal: { kind: "string", text: "same" } }] },
          { name: "Dog", fields: [{ name: "kind", literal: { kind: "string", text: "same" } }] },
        ],
      },
      site(),
    );
    const d = withCode(diags, "loom/parse/duplicate-discriminator-value");
    expect(
      d,
      "loom/parse/duplicate-discriminator-value for two variants sharing a value",
    ).toBeDefined();
    // Message template `duplicate discriminator value '<value>' across variants
    // of <X>` from code-registry-parse.md; <value> renders the literal source
    // text (identifier-shaped `same` rendered bare).
    expect(d?.message).toBe("duplicate discriminator value 'same' across variants of Animal");
  });
});

// --- schemas.md §Discriminated unions — nested discriminator --------------

describe("V5b-T — nested discriminator (loom/parse/nested-discriminator)", () => {
  it("loom/parse/nested-discriminator: a discriminator field whose value is a nested object fires", () => {
    // Explicit `by kind` where each variant's `kind` value is a nested object
    // (`kind: { type: "x" }`) rather than a top-level literal.
    const diags = checkDiscriminatedUnion(
      {
        name: "Animal",
        by: "kind",
        variants: [
          { name: "Cat", fields: [{ name: "kind", nested: true }] },
          { name: "Dog", fields: [{ name: "kind", nested: true }] },
        ],
      },
      site(),
    );
    const d = withCode(diags, "loom/parse/nested-discriminator");
    expect(d, "loom/parse/nested-discriminator for a nested discriminator value").toBeDefined();
    // Message template `discriminator field '<field>' must be at the top level
    // of each variant of <X>` from code-registry-parse.md.
    expect(d?.message).toBe(
      "discriminator field 'kind' must be at the top level of each variant of Animal",
    );
  });
});

// --- schemas.md §Discriminated unions / grammar.md — `by` on object body --

describe("V5b-T — by on object schema (loom/parse/by-on-object-schema)", () => {
  it("loom/parse/by-on-object-schema: a `by` clause on an object body fires; the union form does not", () => {
    // `schema X by f { ... }` — `by` on an object body is illegal.
    const d = checkByClause({ name: "X", form: "object", field: "f" }, site());
    expect(d, "loom/parse/by-on-object-schema for `by` on an object body").toBeDefined();
    expect(d?.code).toBe("loom/parse/by-on-object-schema");
    // Message from grammar.md / code-registry-parse.md (note the literal
    // `A | B | …` with a Unicode ellipsis).
    expect(d?.message).toBe(
      "the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)",
    );

    // `schema X by f = A | B` — `by` on the union form is legal.
    const ok = checkByClause({ name: "X", form: "union", field: "f" }, site());
    expect(ok, "a `by` clause on the union form raises no by-on-object-schema diagnostic").toBeUndefined();
  });
});

// --- schemas.md §Recursion — type-alias cycle -----------------------------

describe("V5b-T — type-alias cycle (loom/parse/type-alias-cycle)", () => {
  it("loom/parse/type-alias-cycle: a pure-alias cycle fires with the path; a cycle through an object hop is accepted", () => {
    // `schema X = Y; schema Y = X` — both nodes are aliases, so the cycle has
    // no object-schema hop and is rejected.
    const diags = detectTypeAliasCycles(
      [
        { name: "X", kind: "alias", references: ["Y"] },
        { name: "Y", kind: "alias", references: ["X"] },
      ],
      site(),
    );
    const d = withCode(diags, "loom/parse/type-alias-cycle");
    expect(d, "loom/parse/type-alias-cycle for a pure-alias cycle").toBeDefined();
    // Message template `type-alias cycle: <path>` from code-registry-parse.md;
    // the path is printed with ` → ` separators, mirroring the import-/
    // invocation-cycle diagnostics (schemas.md §Recursion).
    expect(d?.message).toBe("type-alias cycle: X → Y → X");

    // `schema X = Y; schema Y { f: X }` — the cycle X → Y → X crosses an
    // object-schema hop (`Y` is an object), so it is legal and raises nothing.
    const okDiags = detectTypeAliasCycles(
      [
        { name: "X", kind: "alias", references: ["Y"] },
        { name: "Y", kind: "object", references: ["X"] },
      ],
      site(),
    );
    expect(
      withCode(okDiags, "loom/parse/type-alias-cycle"),
      "a cycle through at least one object-schema hop raises no type-alias-cycle diagnostic",
    ).toBeUndefined();
  });
});
