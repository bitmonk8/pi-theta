// V11c / V11c-T — Binder bypass and the dynamic envelope schema.
//
// This module owns two mechanisms of binder/binder-bypass-and-envelope.md:
//
//   - The binder-bypass decision (§Binder bypass): computed at loom-load time
//     from the static `params:` schema. Two shapes skip the binder call (and the
//     LLM inference) entirely — the no-params bypass (`params:` absent or `{}`)
//     and the single-string bypass (exactly one field, type `string`, no
//     default, not optional/nullable). The no-params check runs before the
//     single-string check. All other shapes go through the binder.
//   - The dynamic envelope schema (§Binder envelope): the runtime constructs one
//     envelope schema per loom at load time — a three-arm discriminated union
//     over `kind` (`ok | needs_info | ambiguous`, BNDR-1) whose `ambiguous` arm
//     keeps `candidates` (`array<string> | null`, BNDR-2). The `ok` arm's `args`
//     is a relaxed copy of the lowered `params` schema with each defaulted field
//     removed from `required` (types unchanged). `message` and each
//     `candidates[i]` carry a `maxLength: 500` model budget (not a user cap).
//   - The two distinct failure-mode template row prefixes (BNDR-3): the
//     `needs_info` row (`argument binding needs more info`) and the `ambiguous`
//     row (`ambiguous arguments`) stay distinct.
//
// V11c-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function with an inert result so the failing tests compile and red on
// their own primary assertions (the bypass classification, envelope schema
// construction, relaxed copy, and distinct template prefixes are all absent).
// The paired V11c implementation leaf fills them in.
//
// Spec: binder/binder-bypass-and-envelope.md (§Binder bypass, §Binder envelope,
// BNDR-1, BNDR-2, BNDR-3), schema-subset.md; failure-mode template rows from
// binder/determinism-cancellation-failure.md#failure-mode-templates-normative.

import type { LoweredSchema } from "../seams/schema-validator";

// --- envelope schema constants ---------------------------------------------

/** The three envelope arms' `kind` discriminator tokens, in schema order (BNDR-1). */
export const BINDER_ENVELOPE_KINDS = ["ok", "needs_info", "ambiguous"] as const;

/** One of the three envelope-arm discriminator tokens. */
export type BinderEnvelopeKind = (typeof BINDER_ENVELOPE_KINDS)[number];

/**
 * The `maxLength` budget on `message` and on each `candidates[i]` in the
 * envelope schema. This is a model budget so a runaway binder response is
 * rejected as malformed, NOT a user-visible cap (the user-visible shaping lives
 * under System-note rendering).
 */
export const BINDER_ENVELOPE_MESSAGE_MAX_LENGTH = 500;

// --- dynamic envelope schema (§Binder envelope) -----------------------------

/** Inputs to envelope-schema construction for a single loom load. */
export interface BuildBinderEnvelopeSchemaInput {
  /**
   * The loom's lowered `params` object schema (Schema Subset — Lowering
   * Algorithm). The relaxed copy embedded in the `ok` arm's `args` is derived
   * from this by removing each defaulted field from `required`.
   */
  readonly paramsSchema: LoweredSchema;
  /**
   * The wire names of the params fields that declared a default. Each is removed
   * from the relaxed copy's `required`; its type is unchanged. When every field
   * has a default, the relaxed copy's `required` is `[]`.
   */
  readonly defaultedFields: readonly string[];
}

/** The constructed envelope schema (a discriminated union over `kind`). */
export type BinderEnvelopeSchema = Readonly<Record<string, unknown>>;

/**
 * Construct the per-loom binder envelope schema (§Binder envelope): a three-arm
 * `anyOf` over `kind` (`ok | needs_info | ambiguous`), with the `ok` arm
 * embedding the relaxed params copy and the `needs_info` / `ambiguous` arms
 * carrying the `maxLength: 500` message budget (and, on `ambiguous`, the
 * retained `candidates: array<string> | null`).
 */
export function buildBinderEnvelopeSchema(
  input: BuildBinderEnvelopeSchemaInput,
): BinderEnvelopeSchema {
  const relaxedArgs = relaxParamsSchema(input.paramsSchema, input.defaultedFields);
  const messageSchema = { type: "string", maxLength: BINDER_ENVELOPE_MESSAGE_MAX_LENGTH } as const;
  return {
    anyOf: [
      {
        type: "object",
        properties: {
          kind: { type: "string", const: "ok" },
          args: relaxedArgs,
        },
        required: ["kind", "args"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          kind: { type: "string", const: "needs_info" },
          message: { ...messageSchema },
        },
        required: ["kind", "message"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          kind: { type: "string", const: "ambiguous" },
          message: { ...messageSchema },
          candidates: {
            type: ["array", "null"],
            items: { type: "string", maxLength: BINDER_ENVELOPE_MESSAGE_MAX_LENGTH },
          },
        },
        required: ["kind", "message", "candidates"],
        additionalProperties: false,
      },
    ],
  };
}

/**
 * Build the `<params-schema-with-defaulted-fields-relaxed>` copy embedded in the
 * `ok` arm's `args` (§Binder envelope): each defaulted field is removed from
 * `required` (its type is unchanged); required-without-default fields are
 * unchanged; the copy keeps `additionalProperties: false`. When every field has
 * a default, the copy's `required` is `[]`.
 */
function relaxParamsSchema(
  paramsSchema: LoweredSchema,
  defaultedFields: readonly string[],
): Readonly<Record<string, unknown>> {
  const source = paramsSchema as Record<string, unknown>;
  const defaulted = new Set(defaultedFields);
  const originalRequired = Array.isArray(source["required"])
    ? (source["required"] as string[])
    : [];
  const relaxedRequired = originalRequired.filter((name) => !defaulted.has(name));
  return {
    ...source,
    required: relaxedRequired,
  };
}

// --- binder bypass (§Binder bypass) -----------------------------------------

/** One declared `params:` field, for the load-time bypass classification. */
export interface BypassParamsField {
  /** The field's wire name. */
  readonly wireName: string;
  /** The field's declared surface type (e.g. `string`, `integer`). */
  readonly type: string;
  /** Whether the field declared a default. */
  readonly hasDefault: boolean;
  /** Whether the field is optional. */
  readonly optional?: boolean;
  /** Whether the field's type is nullable (e.g. `string | null`). */
  readonly nullable?: boolean;
}

/**
 * The load-time binder-bypass decision. `no-params-bypass` and
 * `single-string-bypass` both skip the binder call (and thus the LLM inference);
 * `binder` routes to the binder.
 */
export type BinderBypassDecision =
  | { readonly kind: "no-params-bypass" }
  | { readonly kind: "single-string-bypass"; readonly wireName: string }
  | { readonly kind: "binder" };

/**
 * Classify a loom's bypass eligibility from its static `params:` schema
 * (§Binder bypass). The no-params check (`params:` absent or `{}`) runs BEFORE
 * the single-string check (exactly one field, type `string`, no default, not
 * optional/nullable), so a `params: {}` loom cannot match the single-string
 * branch. All other shapes go through the binder.
 */
export function classifyBinderBypass(
  fields: readonly BypassParamsField[] | undefined,
): BinderBypassDecision {
  // No-params check runs BEFORE single-string, so a `params: {}` loom (zero
  // fields) cannot match the single-string branch.
  if (fields === undefined || fields.length === 0) {
    return { kind: "no-params-bypass" };
  }
  if (fields.length === 1) {
    const field = fields[0];
    if (
      field !== undefined &&
      field.type === "string" &&
      !field.hasDefault &&
      field.optional !== true &&
      field.nullable !== true
    ) {
      return { kind: "single-string-bypass", wireName: field.wireName };
    }
  }
  return { kind: "binder" };
}

/**
 * The ASCII slash-argument whitespace set pinned by System-note rendering rule 1
 * (never the language-dependent `\s` class): trimming strips only these leading
 * and trailing characters, so non-ASCII whitespace (e.g. U+00A0) is preserved.
 */
export function trimSlashArgumentWhitespace(raw: string): string {
  // The ASCII slash-argument whitespace set pinned by System-note rendering
  // rule 1 — space, tab, LF, CR, VT, FF — never the language-dependent `\s`
  // class, so non-ASCII whitespace (e.g. U+00A0) is preserved.
  let start = 0;
  let end = raw.length;
  const isSlashWs = (ch: string | undefined): boolean =>
    ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\v" || ch === "\f";
  while (start < end && isSlashWs(raw[start])) start += 1;
  while (end > start && isSlashWs(raw[end - 1])) end -= 1;
  return raw.slice(start, end);
}

/** Inputs to applying a bypass decision to a slash invocation. */
export interface ApplyBinderBypassInput {
  /** The load-time bypass decision. */
  readonly decision: BinderBypassDecision;
  /** The raw slash text after the command name (untrimmed). */
  readonly slashArguments: string;
}

/** The result of applying a bypass decision — no binder/LLM call is made. */
export interface BinderBypassArgs {
  /** Whether the invocation was bypassed (true for both bypass kinds). */
  readonly bypassed: boolean;
  /**
   * The typed params object produced without any binder call: `{}` for the
   * no-params bypass, `{ [wireName]: <trimmed slash arguments> }` for the
   * single-string bypass.
   */
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Apply a bypass decision to a slash invocation without calling the binder or
 * the LLM (§Binder bypass): the single-string bypass sets the sole field to the
 * entire slash-argument string with leading/trailing slash-argument whitespace
 * trimmed; the no-params bypass yields `{}`. Returns `bypassed: false` for a
 * `binder` decision (the caller runs the binder).
 */
export function applyBinderBypass(input: ApplyBinderBypassInput): BinderBypassArgs {
  const { decision } = input;
  switch (decision.kind) {
    case "no-params-bypass":
      return { bypassed: true, args: {} };
    case "single-string-bypass":
      return {
        bypassed: true,
        args: { [decision.wireName]: trimSlashArgumentWhitespace(input.slashArguments) },
      };
    case "binder":
      return { bypassed: false, args: {} };
  }
}

// --- BNDR-3: distinct failure-mode template row prefixes --------------------

/**
 * The fixed failure-mode template row prefix phrase for a terminating binder
 * failure arm (BNDR-3), sourced from the failure-mode templates table
 * (determinism-cancellation-failure.md#failure-mode-templates-normative): the
 * `needs_info` and `ambiguous` prefixes MUST stay distinct.
 */
export function binderFailureRowPrefix(kind: "needs_info" | "ambiguous"): string {
  return kind === "needs_info" ? "argument binding needs more info" : "ambiguous arguments";
}

/**
 * Render the full failure-mode template row for a terminating binder failure arm
 * (BNDR-3): `loom /<name>: <prefix> — <message>`.
 */
export function renderBinderFailureRow(
  name: string,
  kind: "needs_info" | "ambiguous",
  message: string,
): string {
  return `loom /${name}: ${binderFailureRowPrefix(kind)} \u2014 ${message}`;
}
