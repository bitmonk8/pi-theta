import { describe, expect, it } from "vitest";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlugFn,
} from "../src/seams/schema-validator";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V8c-T — failing tests for the paired `V8c` `SchemaValidator` seam
// implementation (`AjvSchemaValidator`). The bullet traces to PIC-11
// (host-interfaces-services.md) and implementation-notes.md §"Schema
// validation".
//
// These tests red because the V8c-T `AjvSchemaValidator` stub hands back an
// inert validator that rejects every value with a single sentinel error,
// performs no caching, and never emits the slug-collision diagnostic — the
// implementation under test is absent. Each assertion names the specific PIC-11
// behaviour it pins so the red is on the assertion, not a fixture or harness
// throw.

/**
 * A content-addressing function that derives a distinct slug per distinct
 * schema (the canonicalised JSON string is both the slug key and the canonical
 * bytes), so behaviour tests never trip the slug-collision path by accident
 * while identical schemas still hit the cache.
 */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/**
 * A content-addressing function that hands back one fixed slug for every
 * schema while keeping each schema's canonical bytes distinct — the only way to
 * drive a genuine 64-bit slug collision deterministically (two distinct
 * documents hashing alike is otherwise unconstructible).
 */
function fixedSlug(slug: string): SchemaSlugFn {
  return (schema) => ({ slug, canonicalBytes: JSON.stringify(schema) });
}

/** Build a validator plus a captured diagnostics array (the cache's emit sink). */
function makeValidator(slugOf: SchemaSlugFn = jsonSlug): {
  validator: AjvSchemaValidator;
  emitted: Diagnostic[];
} {
  const emitted: Diagnostic[] = [];
  const validator = new AjvSchemaValidator({
    emit: (diagnostic) => emitted.push(diagnostic),
    slugOf,
  });
  return { validator, emitted };
}

describe("V8c-T — SchemaValidator behavioural contract (PIC-11)", () => {
  it("PIC-11: validation reports every error in a single pass (no fast-fail)", () => {
    // Two properties of distinct wrong types — a one-pass validator surfaces
    // BOTH errors, not just the first. A fast-fail validator would stop at /a.
    const schema: LoweredSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a", "b"],
    };
    const { validator, emitted } = makeValidator();
    const result = validator.compile(schema).validate({ a: 1, b: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable: a two-type-error value must not validate");
    }
    const paths = result.errors.map((e) => e.instancePath).sort();
    expect(paths).toContain("/a");
    expect(paths).toContain("/b");
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(emitted).toHaveLength(0);
  });

  it("PIC-11: validation performs NO coercion — a string where a number is required fails and is left as-is", () => {
    // No implicit type conversion in loom 1.0: a numeric string is NOT coerced
    // to a number, so it fails the `type` check, and the input value is not
    // mutated (the validator returns no converted value).
    const schema: LoweredSchema = {
      type: "object",
      properties: { n: { type: "number" } },
      required: ["n"],
    };
    const value: { n: unknown } = { n: "5" };
    const { validator } = makeValidator();
    const result = validator.compile(schema).validate(value);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable: a coercion-free validator rejects the numeric string");
    }
    const typeErrorAtN = result.errors.find(
      (e) => e.instancePath === "/n" && e.keyword === "type",
    );
    expect(typeErrorAtN).toBeDefined();
    // No coercion: the input field is still the original string.
    expect(value.n).toBe("5");
  });

  it("PIC-11: validation performs NO default-filling — a missing optional property is left absent", () => {
    // No default-fill in loom 1.0: an optional property carrying a schema
    // `default` is NOT injected into the validated value; an absent optional
    // property is valid and the input object is not mutated.
    const schema: LoweredSchema = {
      type: "object",
      properties: { x: { type: "string", default: "filled" } },
    };
    const value: Record<string, unknown> = {};
    const { validator } = makeValidator();
    const result = validator.compile(schema).validate(value);

    expect(result.ok).toBe(true);
    // No default merged in: the property stays absent on the input object.
    expect("x" in value).toBe(false);
  });

  it("PIC-11: `$ref` resolves within the lowered document (in-document `$defs`)", () => {
    // A `$ref` into the same document's `$defs` resolves: a conforming value
    // validates and a non-conforming value fails at the ref'd position.
    const schema: LoweredSchema = {
      type: "object",
      properties: { p: { $ref: "#/$defs/Name" } },
      required: ["p"],
      $defs: { Name: { type: "string" } },
    };
    const { validator } = makeValidator();
    const compiled = validator.compile(schema);

    expect(compiled.validate({ p: "hi" }).ok).toBe(true);

    const bad = compiled.validate({ p: 5 });
    expect(bad.ok).toBe(false);
    if (bad.ok) {
      throw new Error("unreachable: a non-string at a string `$ref` must fail");
    }
    expect(bad.errors.some((e) => e.instancePath === "/p" && e.keyword === "type")).toBe(true);
  });

  it("PIC-11: validation silently accepts an unknown JSON-Schema `format` keyword", () => {
    // Loom-emitted schemas never use `format`, but model output can carry one;
    // an unknown `format` must be silently accepted, never raised on.
    const schema: LoweredSchema = { type: "string", format: "totally-made-up-format" };
    const { validator } = makeValidator();

    let compiled: ReturnType<AjvSchemaValidator["compile"]>;
    expect(() => {
      compiled = validator.compile(schema);
    }).not.toThrow();
    expect(compiled!.validate("any string").ok).toBe(true);
  });

  it("PIC-11: validation is deterministic for a given (schema, value) pair", () => {
    // Two independent compilations of the same schema validate identically for
    // both a conforming and a non-conforming value.
    const schema: LoweredSchema = {
      type: "object",
      properties: { s: { type: "string" } },
      required: ["s"],
    };
    const { validator } = makeValidator();
    const first = validator.compile(schema);
    const second = validator.compile(schema);

    expect(first.validate({ s: "ok" }).ok).toBe(true);
    expect(second.validate({ s: "ok" }).ok).toBe(true);
    expect(first.validate({ s: 1 }).ok).toBe(false);
    expect(second.validate({ s: 1 }).ok).toBe(false);
  });
});

describe("V8c-T — slug-cache byte-verify and collision (PIC-11)", () => {
  it("PIC-11: a slug-cache hit with byte-identical canonical form serves the cache with no collision diagnostic", () => {
    // Same schema compiled twice → same slug AND byte-identical canonical form
    // → a clean cache hit: no `validator-cache-collision`, and the served
    // validator still validates correctly.
    const schema: LoweredSchema = {
      type: "object",
      properties: { s: { type: "string" } },
      required: ["s"],
    };
    const { validator, emitted } = makeValidator();
    validator.compile(schema);
    const second = validator.compile(schema);

    expect(emitted).toHaveLength(0);
    expect(second.validate({ s: "ok" }).ok).toBe(true);
  });

  it("PIC-11: a slug-cache byte mismatch fires `loom/runtime/validator-cache-collision` and recompiles the new document", () => {
    // Two DISTINCT schema documents forced to share one slug (different
    // canonical bytes) — a genuine 64-bit slug collision. On the second
    // compile the cache must NOT serve the wrong cached validator: it emits
    // `loom/runtime/validator-cache-collision` and recompiles the new document.
    const SLUG = "deadbeefdeadbeef";
    const schemaA: LoweredSchema = { type: "string" };
    const schemaB: LoweredSchema = { type: "number" };
    const { validator, emitted } = makeValidator(fixedSlug(SLUG));

    validator.compile(schemaA);
    const compiledB = validator.compile(schemaB);

    // The collision diagnostic fired, by code, exactly once.
    const collisions = emitted.filter(
      (d) => d.code === "loom/runtime/validator-cache-collision",
    );
    expect(collisions).toHaveLength(1);
    const collision = collisions[0]!;
    expect(collision.severity).toBe("error");
    // Message sourced from the diagnostics registry (code-registry-runtime.md):
    // `validator-cache collision on slug <slug>: two distinct schema documents hash alike`.
    expect(collision.message).toBe(
      `validator-cache collision on slug ${SLUG}: two distinct schema documents hash alike`,
    );
    // The hint carries both documents' canonical-form bytes.
    expect(collision.hint).toContain(JSON.stringify(schemaA));
    expect(collision.hint).toContain(JSON.stringify(schemaB));

    // The cache served a validator for the NEW document (schemaB: number), not
    // the wrong cached one (schemaA: string): a number validates, a string does not.
    expect(compiledB.validate(42).ok).toBe(true);
    expect(compiledB.validate("not a number").ok).toBe(false);
  });
});
