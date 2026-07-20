import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import {
  checkToolCallArguments,
  computeToolArgSchemaConflict,
  type ToolCallArgCheckInput,
} from "../src/runtime/tool-call";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) — focused unit coverage
// for the provable-disjointness soundness logic
// (`computeToolArgSchemaConflict` and the helpers it drives:
// `subsetKinds` / `kindsDisjoint` / the shared `splitTopLevelUnion`). This is
// the RFC's highest-risk logic: the parse-time front-run of a certain runtime
// AJV rejection. The suite pins the soundness invariant directly — the
// computation reports `provablyDisjoint: true` ONLY for a static-type × schema
// pair a real AJV validator would also reject — plus every unrepresentable case
// (named schema, enum, literal type, `array<T>`, object type) that must defer to
// AJV, and it exercises the same computation on `checkToolCallArguments`'s
// production entry (computed from raw static types, not hand-supplied facts).

const FIELD = "f";

// The five representable subset scalar kinds (schema-subset.md §"The subset").
const PRIMITIVE_KINDS = ["string", "number", "integer", "boolean", "null"] as const;
type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** A JSON Schema fragment for a subset scalar kind. */
function schemaFor(kind: PrimitiveKind): Record<string, unknown> {
  return { type: kind };
}

/**
 * A representative accepted value for a subset scalar kind. `number` is a
 * NON-integer double so a `number`-typed value is genuinely rejected by an
 * `integer` schema (a whole-numbered double would be AJV-accepted as integer).
 */
function representativeValue(kind: PrimitiveKind): unknown {
  switch (kind) {
    case "string":
      return "x";
    case "number":
      return 1.5;
    case "integer":
      return 3;
    case "boolean":
      return true;
    case "null":
      return null;
  }
}

const ajv = new Ajv({ strict: false });

/** Whether AJV rejects `value` against a `{ type: kind }` schema. */
function ajvRejects(value: unknown, schemaKind: PrimitiveKind): boolean {
  const validate = ajv.compile(schemaFor(schemaKind));
  return !validate(value);
}

describe("RFC 0002 — computeToolArgSchemaConflict provable-disjointness soundness matrix", () => {
  it("string ↔ number is provably disjoint in both directions (true)", () => {
    expect(computeToolArgSchemaConflict(FIELD, "number", "string").provablyDisjoint).toBe(true);
    expect(computeToolArgSchemaConflict(FIELD, "string", "number").provablyDisjoint).toBe(true);
  });

  it("integer ↔ number is NOT provably disjoint in either direction (numeric cross-accept)", () => {
    // An `integer` value is a valid `number`, and a whole `number` may be a
    // valid `integer` — the subsets are not disjoint, so the check must defer to
    // the runtime AJV boundary rather than front-run a rejection.
    expect(computeToolArgSchemaConflict(FIELD, "integer", "number").provablyDisjoint).toBe(false);
    expect(computeToolArgSchemaConflict(FIELD, "number", "integer").provablyDisjoint).toBe(false);
  });

  it("boolean / null pairs are provably disjoint (both directions)", () => {
    expect(computeToolArgSchemaConflict(FIELD, "boolean", "null").provablyDisjoint).toBe(true);
    expect(computeToolArgSchemaConflict(FIELD, "null", "boolean").provablyDisjoint).toBe(true);
    // A kind against itself is never disjoint.
    expect(computeToolArgSchemaConflict(FIELD, "boolean", "boolean").provablyDisjoint).toBe(false);
    expect(computeToolArgSchemaConflict(FIELD, "null", "null").provablyDisjoint).toBe(false);
  });

  it("a union with at least one satisfiable arm is NOT provable (false — falls through to AJV)", () => {
    // `string | number` against a `number` schema: the `number` arm is
    // satisfiable, so the value set is not disjoint.
    expect(
      computeToolArgSchemaConflict(FIELD, "string | number", "number").provablyDisjoint,
      "a union with a satisfiable arm is not provably disjoint",
    ).toBe(false);
    // A union whose EVERY arm is disjoint from the schema is still provable.
    expect(
      computeToolArgSchemaConflict(FIELD, "string | boolean", "number").provablyDisjoint,
      "a union all of whose arms are disjoint stays provable",
    ).toBe(true);
    // A union arm that is unrepresentable makes the whole union unprovable.
    expect(
      computeToolArgSchemaConflict(FIELD, "string | Sentiment", "number").provablyDisjoint,
      "an unrepresentable union arm defers the whole union to AJV",
    ).toBe(false);
  });

  it("every unrepresentable form is NOT provable (defers to AJV): named / enum / literal / array<T> / object", () => {
    const unrepresentable = [
      "Sentiment", // named schema
      "Color", // enum (a named type as rendered)
      '"positive"', // literal type
      "array<string>", // array<T>
      "{ x: string }", // object type
      "Result<string, QueryError>", // generic
    ];
    for (const t of unrepresentable) {
      // Against a primitive schema and against another unrepresentable type: the
      // subset cannot enumerate either side, so disjointness is never provable.
      expect(
        computeToolArgSchemaConflict(FIELD, t, "string").provablyDisjoint,
        `${t} as expr type must defer to AJV`,
      ).toBe(false);
      expect(
        computeToolArgSchemaConflict(FIELD, "string", t).provablyDisjoint,
        `${t} as schema type must defer to AJV`,
      ).toBe(false);
    }
  });

  it("soundness invariant: provablyDisjoint === true ONLY when AJV also rejects (full primitive matrix)", () => {
    for (const exprKind of PRIMITIVE_KINDS) {
      for (const schemaKind of PRIMITIVE_KINDS) {
        const facts = computeToolArgSchemaConflict(FIELD, exprKind, schemaKind);
        if (facts.provablyDisjoint) {
          // The soundness contract: a parse-time disjointness front-run must be
          // a CERTAIN runtime AJV rejection. If AJV would accept, the front-run
          // rejected a valid program — a soundness violation.
          expect(
            ajvRejects(representativeValue(exprKind), schemaKind),
            `provablyDisjoint(${exprKind} vs ${schemaKind}) claims disjoint but AJV accepts`,
          ).toBe(true);
        }
      }
    }
  });

  it("the rendered types round-trip onto the facts (expected/actual placeholders)", () => {
    const facts = computeToolArgSchemaConflict(FIELD, "number", "string");
    expect(facts.field).toBe(FIELD);
    expect(facts.expected, "expected renders the schema field type").toBe("string");
    expect(facts.actual, "actual renders the field-expression static type").toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Reachability: `checkToolCallArguments` computes the facts itself from the raw
// static types (`schemaFieldStaticTypes`) via `computeToolArgSchemaConflict`,
// not only from hand-supplied `schemaConflict` facts.
// ---------------------------------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function argSite(
  overrides: Partial<ToolCallArgCheckInput> &
    Pick<ToolCallArgCheckInput, "toolName" | "calleeKind" | "positionalCount">,
): ToolCallArgCheckInput {
  return { file: "call.theta", range: span(), ...overrides };
}

describe("RFC 0002 — checkToolCallArguments computes disjointness from static types (reachable in the check)", () => {
  it("fires theta/parse/tool-arg-schema-conflict when the computed facts prove disjointness", () => {
    const diags = checkToolCallArguments(
      argSite({
        toolName: "read",
        calleeKind: "pi-tool",
        positionalCount: 1,
        argumentSource: "{ path: 42 }",
        // No hand-supplied `schemaConflict`: the raw static types drive the
        // computation through `computeToolArgSchemaConflict`.
        schemaFieldStaticTypes: [{ field: "path", exprType: "number", schemaType: "string" }],
      }),
    );
    const d = diags.find((x) => x.code === "theta/parse/tool-arg-schema-conflict");
    expect(d, "the computed disjointness fires the parse error").toBeDefined();
    expect(d?.message).toBe(
      "Pi tool 'read' argument field 'path' type is provably disjoint from the input schema: expected string, got number",
    );
  });

  it("does NOT fire when the computed facts cannot prove disjointness (integer vs number)", () => {
    const diags = checkToolCallArguments(
      argSite({
        toolName: "read",
        calleeKind: "pi-tool",
        positionalCount: 1,
        argumentSource: "{ n: v }",
        schemaFieldStaticTypes: [{ field: "n", exprType: "integer", schemaType: "number" }],
      }),
    );
    expect(
      diags.find((x) => x.code === "theta/parse/tool-arg-schema-conflict"),
      "a numeric cross-accept is not provably disjoint",
    ).toBeUndefined();
  });

  it("an explicit schemaConflict fact still wins (tests' facts-threading contract preserved)", () => {
    const diags = checkToolCallArguments(
      argSite({
        toolName: "read",
        calleeKind: "pi-tool",
        positionalCount: 1,
        argumentSource: "{ path: 42 }",
        schemaConflict: { field: "path", provablyDisjoint: true, expected: "string", actual: "number" },
        // A conflicting raw-static input is ignored when the explicit fact is present.
        schemaFieldStaticTypes: [{ field: "path", exprType: "integer", schemaType: "number" }],
      }),
    );
    expect(
      diags.find((x) => x.code === "theta/parse/tool-arg-schema-conflict"),
      "the explicit fact drives the emission",
    ).toBeDefined();
  });
});
