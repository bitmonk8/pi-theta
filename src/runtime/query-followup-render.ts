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
//     changes. The literal U+0060 backticks around `` `__theta_respond_<slug>` ``
//     and the trailing U+000A after the `<schema-json>` interpolation are part of
//     the emitted bytes; each rendered template ends with `<schema-json>`
//     followed by U+000A.
//   - QRY-12 `<schema-json>`: `JSON.stringify(schema, null, 2)` over the
//     **lowered** response schema (the JSON Schema handed to AJV per
//     schema-subset.md), not the source-Theta-type form. `<slug>` is the schema
//     slug of that same lowered response schema, tying the follow-up's tool
//     reference byte-equal to the synthesised `__theta_respond_<slug>` tool name.
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
// Bug 0010 (QRY-15): this module also owns `renderInitialRespondTurn` — the
// typed query's INITIAL forced-respond-turn template (the trailing
// `context.messages` user entry of the off-session `complete()` dispatch).
// QRY-15's instruction bytes are the QRY-12 `schema_repeat` template minus the
// leading non-compliance sentence, so both renderers share one instruction
// builder and wording drift between the two templates is structurally
// impossible.
//
// Spec: query/query-failure-and-repair.md (QRY-12 follow-up turn templates,
// `<ajv-summary>` / `<schema-json>` / `<slug>` placeholders),
// query/query-tool-loop.md (QRY-15 initial respond-turn template),
// errors-and-results/queryerror-variants.md (ERR-14 `ValidationIssue` ordering).

import { orderValidationIssues, type ValidationIssue } from "./query-error";

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
 * response schema, not the source-Theta-type form — serialised into
 * `<schema-json>` as `JSON.stringify(loweredSchema, null, 2)`. `slug` is the
 * schema slug of that same lowered response schema, naming the
 * `__theta_respond_<slug>` tool. `issues` is the **most recent** failed attempt's
 * `ValidationIssue` entries, rendered into `<ajv-summary>` for `validator_error`
 * (ignored by `schema_repeat`); the renderer emits them in the canonical ERR-14
 * order and never accumulates across attempts.
 */
export interface FollowUpTurnInput {
  readonly methodology: FollowUpMethodology;
  readonly loweredSchema: unknown;
  readonly slug: string;
  /**
   * The REGISTERED respond-tool name (bug 0010 fix review, F6). Under a PIC-44
   * slug collision the registration mints a disambiguated
   * `__theta_respond_<slug>_<n>` name; QRY-12 pins the template's tool
   * reference byte-equal to the registered name, so the caller that knows the
   * registered name MUST thread it here. When absent the reference falls back
   * to the recipe-derived `__theta_respond_<slug>` (the undisambiguated case —
   * byte-identical for every non-colliding registration).
   */
  readonly toolName?: string;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Render one respond-repair follow-up user turn byte-for-byte (QRY-12).
 *
 * The returned string is the verbatim user-turn body for `input.methodology`
 * with only the `<…>` placeholders interpolated: `<ajv-summary>` (validator_error
 * only, canonical ERR-14 order over `input.issues`), the literal-backtick-wrapped
 * `` `__theta_respond_<slug>` `` tool reference, and the `JSON.stringify(schema,
 * null, 2)` `<schema-json>` over `input.loweredSchema`, terminated by the single
 * trailing U+000A the template mandates.
 *
 * The paired `V13h` leaf implements the renderer.
 */
export function renderFollowUpTurn(input: FollowUpTurnInput): string {
  const instructionAndSchema = renderInstructionAndSchema(
    input.loweredSchema,
    input.toolName ?? "__theta_respond_" + input.slug,
  );

  // The non-compliance sentence leads both templates verbatim (QRY-12).
  const nonComplianceSentence =
    "Your previous response did not match the required schema. ";

  if (input.methodology === "validator_error") {
    // `<ajv-summary>` — the in-order `<path> <message>` concatenation of the
    // most-recent failed attempt's issues, joined by `; ` in the canonical
    // ERR-14 order. The renderer is handed only the current attempt's issues, so
    // the summary is never cumulative across attempts (QRY-12 / ERR-14).
    const ajvSummary = orderValidationIssues(input.issues)
      .map((issue) => issue.path + " " + issue.message)
      .join("; ");
    return (
      nonComplianceSentence +
      "Validation errors: " +
      ajvSummary +
      ". " +
      instructionAndSchema
    );
  }

  // `schema_repeat` — the non-compliance sentence plus the instruction sentence
  // and `<schema-json>`; it carries no `<ajv-summary>` clause (QRY-12).
  return nonComplianceSentence + instructionAndSchema;
}

/** The inputs to rendering the QRY-15 initial forced-respond-turn template. */
export interface InitialRespondTurnInput {
  /** The lowered response schema (the JSON Schema handed to AJV). */
  readonly loweredSchema: unknown;
  /** The lowered schema's slug, naming `__theta_respond_<slug>`. */
  readonly slug: string;
  /**
   * The REGISTERED respond-tool name (bug 0010 fix review, F6): overrides the
   * recipe-derived `__theta_respond_<slug>` reference so a PIC-44
   * collision-disambiguated registration (`__theta_respond_<slug>_<n>`) is
   * named byte-equal by the QRY-15 instruction. Absent ⇒ the undisambiguated
   * recipe name (unchanged bytes).
   */
  readonly toolName?: string;
}

/**
 * Render the QRY-15 initial respond-turn template byte-for-byte (bug 0010):
 * the trailing `context.messages` user entry of the typed query's off-session
 * forced respond `complete()` dispatch. The bytes are the instruction sentence
 * naming the backticked `` `__theta_respond_<slug>` `` tool, a single U+000A,
 * `JSON.stringify(loweredSchema, null, 2)`, and the mandated trailing U+000A —
 * byte-identical to the QRY-12 `schema_repeat` follow-up minus its leading
 * non-compliance sentence, because both renderers share `renderInstructionAndSchema`.
 */
export function renderInitialRespondTurn(input: InitialRespondTurnInput): string {
  return renderInstructionAndSchema(
    input.loweredSchema,
    input.toolName ?? "__theta_respond_" + input.slug,
  );
}

/**
 * The shared instruction-plus-schema builder (QRY-12 / QRY-15): the
 * instruction sentence with its literal-U+0060-backtick-wrapped
 * `` `__theta_respond_<slug>` `` reference, a single trailing U+000A, then
 * `<schema-json>` (`JSON.stringify(schema, null, 2)` over the LOWERED response
 * schema) and the mandated trailing U+000A. One builder feeds both the QRY-12
 * follow-up templates and the QRY-15 initial template so the emitted bytes
 * cannot drift apart (bug 0010).
 */
function renderInstructionAndSchema(loweredSchema: unknown, toolName: string): string {
  // `<schema-json>` — JSON.stringify(schema, null, 2) over the lowered response
  // schema (the form handed to AJV), not the source-Theta-type form (QRY-12).
  const schemaJson = JSON.stringify(loweredSchema, null, 2);
  // The tool reference names the REGISTERED respond tool — `__theta_respond_
  // <slug>` in the common case, the PIC-44 collision-disambiguated name when
  // the caller threaded one (bug 0010 fix review, F6) — byte-equal to the name
  // the provider is forced to (QRY-12). Wrapped in literal U+0060 backticks.
  const toolRef = "`" + toolName + "`";
  return (
    "Return your final answer using the " +
    toolRef +
    " tool, conforming to this schema:\n" +
    schemaJson +
    "\n"
  );
}
