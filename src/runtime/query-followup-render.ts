// V13h / V13h-T — byte-exact respond-repair follow-up turn template rendering.
//
// This module owns the pure follow-up user-turn rendering the paired `V13h`
// implementation leaf fills in for the schema-validation respond-repair loop
// (query/query-failure-and-repair.md QRY-12). The respond-repair loop's control
// flow and attempt accounting are owned by `V13d`
// (`src/runtime/query-respond-repair.ts`); this module owns *only* the verbatim
// template rendering the loop hands to the follow-up driver.
//
//   - QRY-12 verbatim templates: each non-`none` methodology — `validator_error`
//     and `schema_repeat` — emits a **user-role** follow-up turn whose surrounding
//     template text is byte-for-byte fixed; only the `<…>` placeholders are
//     interpolated. Wording or whitespace changes are spec-versioned breaking
//     changes. The literal U+0060 backticks around `` `__loom_respond_<slug>` ``
//     and the trailing U+000A after the `<schema-json>` interpolation are part of
//     the emitted bytes; each rendered template ends with `<schema-json>`
//     followed by U+000A.
//   - QRY-12 `<schema-json>`: `JSON.stringify(schema, null, 2)` over the
//     **lowered** response schema (the JSON Schema handed to AJV per
//     schema-subset.md), not the source-Loom-type form. `<slug>` is the schema
//     slug of that same lowered response schema, tying the follow-up's tool
//     reference byte-equal to the synthesised `__loom_respond_<slug>` tool name.
//   - QRY-12 `<ajv-summary>` (validator_error only): the in-order
//     `<path> <message>` concatenation of the failed validation's
//     `ValidationIssue` entries, joined by `; ` in the canonical
//     `validation_errors` order (ERR-14). On a multi-attempt sequence each
//     follow-up's `<ajv-summary>` reflects only the **most recent** failed
//     attempt's issues — never a cumulative concatenation across attempts (that
//     property is a consequence of the renderer being handed only the current
//     attempt's issues and rendering only those).
//
// V13h-T (this tests task) declares the seam shape and stubs `renderFollowUpTurn`
// inert (it returns the empty string) so the failing tests compile and red on
// their own primary byte-comparison assertions while the paired `V13h`
// implementation is absent. The paired `V13h` leaf fills the renderer in.
//
// Spec: query/query-failure-and-repair.md (QRY-12 follow-up turn templates,
// `<ajv-summary>` / `<schema-json>` / `<slug>` placeholders),
// errors-and-results/queryerror-variants.md (ERR-14 `ValidationIssue` ordering).

import type { ValidationIssue } from "./query-error";

/**
 * The non-`none` respond-repair methodologies, each with its own follow-up
 * template (QRY-12). `none` issues no follow-up, so it has no template and is not
 * a member of this type.
 */
export type FollowUpMethodology = "validator_error" | "schema_repeat";

/**
 * The inputs to rendering one respond-repair follow-up user turn (QRY-12).
 *
 * `loweredSchema` is the JSON Schema value actually handed to AJV — the lowered
 * response schema, not the source-Loom-type form — serialised into
 * `<schema-json>` as `JSON.stringify(loweredSchema, null, 2)`. `slug` is the
 * schema slug of that same lowered response schema, naming the
 * `__loom_respond_<slug>` tool. `issues` is the **most recent** failed attempt's
 * `ValidationIssue` entries, rendered into `<ajv-summary>` for `validator_error`
 * (ignored by `schema_repeat`); the renderer emits them in the canonical ERR-14
 * order and never accumulates across attempts.
 */
export interface FollowUpTurnInput {
  readonly methodology: FollowUpMethodology;
  readonly loweredSchema: unknown;
  readonly slug: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Render one respond-repair follow-up user turn byte-for-byte (QRY-12).
 *
 * The returned string is the verbatim user-turn body for `input.methodology`
 * with only the `<…>` placeholders interpolated: `<ajv-summary>` (validator_error
 * only, canonical ERR-14 order over `input.issues`), the literal-backtick-wrapped
 * `` `__loom_respond_<slug>` `` tool reference, and the `JSON.stringify(schema,
 * null, 2)` `<schema-json>` over `input.loweredSchema`, terminated by the single
 * trailing U+000A the template mandates.
 *
 * The paired `V13h` leaf implements the renderer.
 */
export function renderFollowUpTurn(_input: FollowUpTurnInput): string {
  // V13h-T inert stub: return the empty string so every byte-comparison test
  // reds on its own primary assertion because the `V13h` renderer is absent —
  // never a compile error, missing fixture, or harness throw.
  return "";
}
