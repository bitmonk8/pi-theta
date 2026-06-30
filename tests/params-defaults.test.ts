import { describe, expect, it } from "vitest";
import {
  parseParams,
  type BodyTypeDeclaration,
  type ParamFieldInput,
} from "../src/parser/params";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlugFn,
} from "../src/seams/schema-validator";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";

// V6b-T — failing tests for the paired `V6b` "`params` and defaults"
// implementation.
//
// Spec: frontmatter/frontmatter-fields-a.md §params (type-expression RHS with
// whole-file forward references; whole-file `NamedType` resolution →
// `loom/parse/unresolved-named-type`) and §Defaults (literal-sublanguage
// defaults → `loom/parse/default-not-literal`; no-non-defaulted-after-defaulted
// ordering → `loom/parse/non-trailing-default`; AJV validation against the
// lowered schema).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V6b `params:` contract is absent: `parseParams`
// is an inert stub returning `{ diagnostics: [] }`. Each test reds on its own
// primary assertion (an absent expected diagnostic, or an undefined lowered
// schema the AJV validation cannot exercise) — not on a compile error, missing
// fixture, or harness throw.

const SITE = { file: "test.loom" } as const;

/** A throwaway located range (the contract's checks are order/shape-driven). */
function range(line: number): SourceRange {
  return {
    start: { line, column: 1 },
    end: { line, column: 10 },
  };
}

/** A `params:` field with no default. */
function field(name: string, typeSource: string, line: number): ParamFieldInput {
  return { name, typeSource, range: range(line) };
}

/** A `params:` field carrying a `= <default>` RHS. */
function defaulted(
  name: string,
  typeSource: string,
  defaultSource: string,
  line: number,
): ParamFieldInput {
  return { name, typeSource, defaultSource, range: range(line) };
}

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A content-addressing function deriving a distinct slug per distinct schema. */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/** A real AJV validator (the `V8c` seam) plus its diagnostics sink. */
function makeValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}

// --- §Defaults — no non-defaulted field after a defaulted one --------------

describe("V6b-T — default ordering (loom/parse/non-trailing-default)", () => {
  it("loom/parse/non-trailing-default: a non-defaulted param after a defaulted one fires, naming the offending field", () => {
    // `language` defaults; `focus_areas` does not and follows it — illegal.
    const r = parseParams(
      [
        defaulted("language", "string", '"TypeScript"', 1),
        field("focus_areas", "array<string>", 2),
      ],
      [],
      SITE,
    );
    const d = withCode(r.diagnostics, "loom/parse/non-trailing-default");
    expect(d, "loom/parse/non-trailing-default for a non-defaulted field after a defaulted one").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md; `<field>` names the first offender.
    expect(d?.message).toBe(
      "non-defaulted param 'focus_areas' follows a defaulted param; defaulted params must be trailing",
    );
  });

  it("loom/parse/non-trailing-default: all-trailing defaults raise no ordering error", () => {
    const r = parseParams(
      [
        field("language", "string", 1),
        defaulted("focus_areas", "array<string>", "[]", 2),
      ],
      [],
      SITE,
    );
    expect(
      withCode(r.diagnostics, "loom/parse/non-trailing-default"),
      "a defaulted field trailing a non-defaulted field raises no ordering error",
    ).toBeUndefined();
  });
});

// --- §Defaults — the default RHS must be a literal-sublanguage form --------

describe("V6b-T — non-literal defaults (loom/parse/default-not-literal)", () => {
  it("loom/parse/default-not-literal: a default that is not a loom literal fires, naming the offending sub-expression", () => {
    // `compute()` is a function call — outside the literal sublanguage.
    const r = parseParams(
      [defaulted("language", "string", "compute()", 1)],
      [],
      SITE,
    );
    const d = withCode(r.diagnostics, "loom/parse/default-not-literal");
    expect(d, "loom/parse/default-not-literal for a function-call default RHS").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md; `<expr>` names the offending form.
    expect(d?.message).toBe(
      "params default RHS must be a literal-sublanguage form; offending sub-expression: compute()",
    );
  });

  it("loom/parse/default-not-literal: a primitive-literal default raises no diagnostic", () => {
    const r = parseParams(
      [defaulted("language", "string", '"TypeScript"', 1)],
      [],
      SITE,
    );
    expect(
      withCode(r.diagnostics, "loom/parse/default-not-literal"),
      "a primitive-literal default RHS is admitted",
    ).toBeUndefined();
  });
});

// --- §params — AJV validation against the lowered schema -------------------

describe("V6b-T — params validated through AJV against their lowered schema", () => {
  it("params lower to a schema AJV accepts a well-typed argument set against and rejects a mistyped one", () => {
    const r = parseParams([field("language", "string", 1)], [], SITE);
    const schema = r.loweredSchema;
    expect(schema, "params lower to an AJV-validatable schema document").toBeDefined();
    const compiled = makeValidator().compile(schema ?? ({} as LoweredSchema));
    // A well-typed argument set validates; a mistyped one fails.
    expect(compiled.validate({ language: "TypeScript" }).ok, "a well-typed argument set validates").toBe(true);
    expect(compiled.validate({ language: 42 }).ok, "a mistyped argument set fails AJV").toBe(false);
  });
});

// --- §params — whole-file forward reference to a body type -----------------

describe("V6b-T — forward-referenced named type resolves and validates (loom/parse/unresolved-named-type)", () => {
  it("a params RHS forward-referencing a body `schema` resolves (no unresolved-named-type) and validates correctly", () => {
    // `author: Author`, where `schema Author { ... }` appears LATER in the body.
    // Resolution is whole-file, so the forward reference resolves.
    const authorDecl: BodyTypeDeclaration = {
      name: "Author",
      lowered: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
    };
    const r = parseParams([field("author", "Author", 1)], [authorDecl], SITE);
    expect(
      withCode(r.diagnostics, "loom/parse/unresolved-named-type"),
      "a forward-referenced body type resolves whole-file — no unresolved-named-type",
    ).toBeUndefined();
    const schema = r.loweredSchema;
    expect(schema, "the resolved named type lowers into the params schema").toBeDefined();
    const compiled = makeValidator().compile(schema ?? ({} as LoweredSchema));
    expect(compiled.validate({ author: { name: "Ada" } }).ok, "a valid Author argument validates").toBe(true);
    expect(compiled.validate({ author: { role: "dev" } }).ok, "an Author missing `name` fails AJV").toBe(false);
  });
});

// --- §params — a named type that resolves to no declaration ----------------

describe("V6b-T — unresolved named type (loom/parse/unresolved-named-type)", () => {
  it("loom/parse/unresolved-named-type: a params named type with no body declaration fires, naming the type", () => {
    // `reviewer: Reviewer`, but no `schema`/`enum Reviewer` exists anywhere.
    const r = parseParams([field("reviewer", "Reviewer", 1)], [], SITE);
    const d = withCode(r.diagnostics, "loom/parse/unresolved-named-type");
    expect(d, "loom/parse/unresolved-named-type for a named type with no body declaration").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md; `<name>` names the unresolved type.
    expect(d?.message).toBe("unresolved named type 'Reviewer'");
  });
});
