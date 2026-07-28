import { describe, expect, it } from "vitest";
import {
  buildBinderEnvelopeSchema,
  classifyBinderBypass,
  applyBinderBypass,
  trimSlashArgumentWhitespace,
  binderFailureRowPrefix,
  renderBinderFailureRow,
  BINDER_ENVELOPE_KINDS,
  BINDER_ENVELOPE_MESSAGE_MAX_LENGTH,
  type BypassParamsField,
  type BinderEnvelopeSchema,
} from "../src/binder/binder-envelope";
import type { LoweredSchema } from "../src/seams/schema-validator";

// V11c-T — Binder bypass and envelope schema (tests).
//
// Written against the seams the paired V11c implementation leaf fills in; every
// test MUST fail red for the intended reason (the bypass classification,
// envelope-schema construction, relaxed copy, message budget, and distinct
// failure-mode template prefixes are all absent from the V11c-T stubs).
//
// Spec: binder/binder-bypass-and-envelope.md (§Binder bypass, §Binder envelope,
// BNDR-1, BNDR-2, BNDR-3); failure-mode template rows sourced from
// binder/determinism-cancellation-failure.md#failure-mode-templates-normative.

// --- test helpers -----------------------------------------------------------

/** A lowered `params` object schema with the given required-field wire names. */
const paramsSchemaOf = (
  properties: Record<string, unknown>,
  required: readonly string[],
): LoweredSchema => ({
  type: "object",
  properties,
  required: [...required],
  additionalProperties: false,
});

/** The `anyOf` arm array of a constructed envelope schema. */
const armsOf = (schema: BinderEnvelopeSchema): readonly Record<string, unknown>[] => {
  const anyOf = (schema as { anyOf?: unknown }).anyOf;
  return Array.isArray(anyOf) ? (anyOf as Record<string, unknown>[]) : [];
};

/** The arm whose `kind` property carries the given `const` token, if present. */
const armByKind = (
  schema: BinderEnvelopeSchema,
  kind: string,
): Record<string, unknown> | undefined =>
  armsOf(schema).find((arm) => {
    const props = (arm as { properties?: Record<string, unknown> }).properties;
    const kindProp = props?.["kind"] as { const?: unknown } | undefined;
    return kindProp?.const === kind;
  });

/** Read `arm.properties[name]` as an object, or `undefined`. */
const propOf = (
  arm: Record<string, unknown> | undefined,
  name: string,
): Record<string, unknown> | undefined => {
  const props = (arm as { properties?: Record<string, unknown> } | undefined)?.properties;
  return props?.[name] as Record<string, unknown> | undefined;
};

/** Read `arm.required` as a string array, or `[]`. */
const requiredOf = (arm: Record<string, unknown> | undefined): readonly string[] => {
  const req = (arm as { required?: unknown } | undefined)?.required;
  return Array.isArray(req) ? (req as string[]) : [];
};

const stringField = (overrides: Partial<BypassParamsField> = {}): BypassParamsField => ({
  wireName: "query",
  type: "string",
  hasDefault: false,
  ...overrides,
});

// --- BNDR-1: three-arm discriminator ----------------------------------------

describe("V11c-T — BNDR-1: three-arm ok | needs_info | ambiguous discriminator", () => {
  it("BNDR-1: the envelope schema is a three-arm anyOf discriminated on `kind`", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf({ query: { type: "string" } }, ["query"]),
      defaultedFields: [],
    });
    const arms = armsOf(schema);
    // Three arms, one per envelope kind, discriminated on the `kind` const.
    expect(arms).toHaveLength(3);
    const kinds = arms.map((arm) => {
      const props = (arm as { properties?: Record<string, unknown> }).properties;
      const kindProp = props?.["kind"] as { const?: unknown } | undefined;
      return kindProp?.const;
    });
    expect(kinds).toEqual([...BINDER_ENVELOPE_KINDS]);
    expect(kinds).toEqual(["ok", "needs_info", "ambiguous"]);
  });

  it("BNDR-1: no arm is folded away — all three kinds are present", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf({ query: { type: "string" } }, ["query"]),
      defaultedFields: [],
    });
    expect(armByKind(schema, "ok")).toBeDefined();
    expect(armByKind(schema, "needs_info")).toBeDefined();
    expect(armByKind(schema, "ambiguous")).toBeDefined();
  });
});

// --- BNDR-2: ambiguous.candidates retained ----------------------------------

describe("V11c-T — BNDR-2: ambiguous.candidates stays in the schema (array<string> | null)", () => {
  it("BNDR-2: the ambiguous arm keeps `candidates` typed as array-or-null of strings", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf({ query: { type: "string" } }, ["query"]),
      defaultedFields: [],
    });
    const ambiguous = armByKind(schema, "ambiguous");
    const candidates = propOf(ambiguous, "candidates");
    // `array<string> | null`: the multi-type-array form accepting null, items
    // are strings. AJV therefore accepts `candidates: null`.
    expect(candidates?.["type"]).toEqual(["array", "null"]);
    const items = candidates?.["items"] as { type?: unknown } | undefined;
    expect(items?.type).toBe("string");
    // `candidates` is a required member of the ambiguous arm (spec schema).
    expect(requiredOf(ambiguous)).toContain("candidates");
  });
});

// --- relaxed copy + message budget ------------------------------------------

describe("V11c-T — envelope is a relaxed params copy with a maxLength:500 model budget", () => {
  it("relaxed copy: each defaulted field is removed from the ok arm's args.required, types unchanged", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf(
        { language: { type: "string" }, focus: { type: "string" } },
        ["language", "focus"],
      ),
      defaultedFields: ["focus"],
    });
    const ok = armByKind(schema, "ok");
    const args = propOf(ok, "args");
    const argsRequired = Array.isArray((args as { required?: unknown } | undefined)?.required)
      ? ((args as { required: string[] }).required)
      : [];
    // The defaulted field is dropped from `required`; the required-without-default
    // field is unchanged; the relaxed copy keeps additionalProperties:false.
    expect(argsRequired).toContain("language");
    expect(argsRequired).not.toContain("focus");
    expect((args as { additionalProperties?: unknown } | undefined)?.additionalProperties).toBe(
      false,
    );
    const argProps = (args as { properties?: Record<string, unknown> } | undefined)?.properties;
    expect(argProps?.["focus"]).toBeDefined();
  });

  it("relaxed copy: when every params field has a default, args.required is []", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf({ focus: { type: "string" } }, ["focus"]),
      defaultedFields: ["focus"],
    });
    const args = propOf(armByKind(schema, "ok"), "args");
    const argsRequired = (args as { required?: unknown } | undefined)?.required;
    expect(argsRequired).toEqual([]);
  });

  it("$defs closure: the params schema's root $defs hoists to the ENVELOPE document root (dropped from the args copy) so #/$defs refs resolve — the spec pins the closure on the envelope schema document", () => {
    // A NamedType param lowers to `{ "$ref": "#/$defs/<name>" }` with the
    // resolved fragment under the params schema's root `$defs`. JSON-Schema
    // `#/…` pointers resolve from the DOCUMENT root, so the closure must ride
    // the envelope root — nested inside the ok arm's args it is unreachable to
    // AJV (the bug-0011 routing step compiles the envelope document) and to the
    // attachment inliner (which dereferences the attached copy's refs against
    // the envelope document's root $defs — the bug-0011 live-round wire shape;
    // this AJV-side hoist cell is unchanged by that flip).
    const authorDef = { type: "object", properties: { name: { type: "string" } } };
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: {
        type: "object",
        properties: { author: { $ref: "#/$defs/Author" } },
        required: ["author"],
        additionalProperties: false,
        $defs: { Author: authorDef },
      },
      defaultedFields: [],
    });
    expect((schema as { $defs?: unknown }).$defs).toEqual({ Author: authorDef });
    const args = propOf(armByKind(schema, "ok"), "args");
    expect(args?.["$defs"]).toBeUndefined();
    expect((args?.["properties"] as Record<string, unknown>)["author"]).toEqual({
      $ref: "#/$defs/Author",
    });
  });

  it("model budget: message carries maxLength:500 on both failure arms (not a user cap)", () => {
    const schema = buildBinderEnvelopeSchema({
      paramsSchema: paramsSchemaOf({ query: { type: "string" } }, ["query"]),
      defaultedFields: [],
    });
    expect(BINDER_ENVELOPE_MESSAGE_MAX_LENGTH).toBe(500);
    const needsInfoMessage = propOf(armByKind(schema, "needs_info"), "message");
    const ambiguousMessage = propOf(armByKind(schema, "ambiguous"), "message");
    expect(needsInfoMessage?.["maxLength"]).toBe(500);
    expect(ambiguousMessage?.["maxLength"]).toBe(500);
    // Each candidates[i] carries the same model budget.
    const candidates = propOf(armByKind(schema, "ambiguous"), "candidates");
    const items = candidates?.["items"] as { maxLength?: unknown } | undefined;
    expect(items?.maxLength).toBe(500);
  });
});

// --- bypass path skips the LLM call -----------------------------------------

describe("V11c-T — binder bypass path (skips the LLM call)", () => {
  it("no-params bypass: undefined or empty params classify as no-params-bypass", () => {
    expect(classifyBinderBypass(undefined)).toEqual({ kind: "no-params-bypass" });
    expect(classifyBinderBypass([])).toEqual({ kind: "no-params-bypass" });
  });

  it("single-string bypass: one plain-string field bypasses; near-misses route to the binder", () => {
    // Primary assertion — the single-string bypass fires for exactly one
    // required plain-string field.
    expect(classifyBinderBypass([stringField({ wireName: "prompt" })])).toEqual({
      kind: "single-string-bypass",
      wireName: "prompt",
    });
    // Near-misses (defaulted, non-string, optional, nullable, multi-field) go
    // through the binder rather than bypassing.
    expect(classifyBinderBypass([stringField({ hasDefault: true })]).kind).toBe("binder");
    expect(classifyBinderBypass([stringField({ type: "integer" })]).kind).toBe("binder");
    expect(classifyBinderBypass([stringField({ optional: true })]).kind).toBe("binder");
    expect(classifyBinderBypass([stringField({ nullable: true })]).kind).toBe("binder");
    expect(
      classifyBinderBypass([stringField({ wireName: "a" }), stringField({ wireName: "b" })]).kind,
    ).toBe("binder");
  });

  it("no-params check runs before single-string: a zero-field params classifies no-params", () => {
    // A params:{} theta (zero fields) must classify no-params, not single-string
    // and not binder.
    expect(classifyBinderBypass([]).kind).toBe("no-params-bypass");
  });

  it("single-string bypass sets the field to the trimmed slash-argument string without a binder call", () => {
    const result = applyBinderBypass({
      decision: { kind: "single-string-bypass", wireName: "prompt" },
      slashArguments: "  hello world \n",
    });
    // The bypass skips the LLM call: the value is produced purely from the raw
    // slash text with leading/trailing slash-argument whitespace trimmed.
    expect(result.bypassed).toBe(true);
    expect(result.args).toEqual({ prompt: "hello world" });
  });

  it("no-params bypass yields empty args without a binder call", () => {
    const result = applyBinderBypass({
      decision: { kind: "no-params-bypass" },
      slashArguments: "ignored",
    });
    expect(result.bypassed).toBe(true);
    expect(result.args).toEqual({});
  });

  it("slash-argument trimming strips ASCII whitespace only, preserving U+00A0", () => {
    // Leading/trailing ASCII whitespace (tab, LF, space) is stripped.
    expect(trimSlashArgumentWhitespace("  \t hi \n")).toBe("hi");
    // U+00A0 lies outside the slash-argument whitespace set and is preserved.
    expect(trimSlashArgumentWhitespace("\u00A0hi\u00A0")).toBe("\u00A0hi\u00A0");
  });
});

// --- BNDR-3: distinct failure-mode template row prefixes --------------------

describe("V11c-T — BNDR-3: needs_info and ambiguous template prefixes stay distinct", () => {
  it("BNDR-3: the two failure-arm row prefixes are the distinct spec phrases", () => {
    // Sourced verbatim from the failure-mode templates table
    // (determinism-cancellation-failure.md#failure-mode-templates-normative).
    expect(binderFailureRowPrefix("needs_info")).toBe("argument binding needs more info");
    expect(binderFailureRowPrefix("ambiguous")).toBe("ambiguous arguments");
    expect(binderFailureRowPrefix("needs_info")).not.toBe(binderFailureRowPrefix("ambiguous"));
  });

  it("BNDR-3: the rendered rows keep the distinct `theta /<name>:` prefixes", () => {
    expect(renderBinderFailureRow("code-review", "needs_info", "which language?")).toBe(
      "theta /code-review: argument binding needs more info — which language?",
    );
    expect(renderBinderFailureRow("code-review", "ambiguous", "two authors match")).toBe(
      "theta /code-review: ambiguous arguments — two authors match",
    );
  });
});
