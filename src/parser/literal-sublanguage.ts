// V2a / V2a-T — the loom literal-sublanguage seam.
//
// This module owns the "is-literal" check of grammar.md §"Loom literal
// sublanguage": the strict subset of the expression grammar admitted at a
// `params:` default RHS and at the single positional argument of a Pi-tool
// call. Every literal is a legal loom expression, but only the enumerated
// productions (primitive / named-value `Enum.Variant` / array / bare- and
// named-object literals) are admitted; the parser runs the is-literal check
// after parsing the AST in those positions.
//
//   - `loom/parse/default-not-literal` — a `params:` default RHS contains a
//     form outside the literal sublanguage (an operator other than the unary-`-`
//     numeric carve-out, a function/tool call, an identifier reference other
//     than `Enum.Variant`, `${...}` interpolation, or an `@`...`` template).
//   - `loom/parse/tool-arg-not-literal` — the Pi-tool-call argument contains
//     such a form.
//   - `loom/parse/missing-object-field` — a bare- or named-object literal omits
//     a declared (required) field of its LHS / variant schema (partial defaults
//     are not supported).
//
// V2a-T (tests-task) declares these seam shapes and stubs both checks as inert
// no-ops (no diagnostic produced) so the failing tests compile and red on their
// own primary assertions (the is-literal check and the full-field-requirement
// check are absent). The paired V2a implementation leaf fills them in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/**
 * Which literal position an expression occupies — selects the diagnostic code
 * the is-literal failure reports.
 *
 *   - `default`  — a `params:` frontmatter default RHS → `loom/parse/default-not-literal`.
 *   - `tool-arg` — a Pi-tool call's single positional argument → `loom/parse/tool-arg-not-literal`.
 */
export type LiteralPosition = "default" | "tool-arg";

/** A located site at which a literal-sublanguage check is run. */
export interface LiteralCheckSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Run the is-literal check against an expression as written in source at a
 * literal position, returning every diagnostic raised. A form outside the
 * literal sublanguage fires `loom/parse/default-not-literal` (defaults position)
 * or `loom/parse/tool-arg-not-literal` (Pi-tool argument position); the
 * diagnostic names the offending sub-expression.
 *
 * V2a-T stubs this as an inert no-op (returns no diagnostics); the paired V2a
 * implementation leaf parses the AST and applies the is-literal check.
 */
export function checkLiteralSublanguage(
  _source: string,
  _position: LiteralPosition,
  _site: LiteralCheckSite,
): Diagnostic[] {
  return [];
}

/**
 * The declared shape of the LHS / variant schema a constructor literal targets:
 * its name (for the diagnostic message) and the set of declared (required)
 * field names. Discriminator fields in discriminated-union-variant constructors
 * are supplied by the variant schema and are not listed here.
 */
export interface ObjectSchemaSpec {
  readonly name: string;
  readonly fields: readonly string[];
}

/**
 * Check that a bare- or named-object literal supplies every declared field of
 * its schema. A field declared by `schema` but absent from `presentFields`
 * fires `loom/parse/missing-object-field` (partial defaults are not supported);
 * field order is free. Returns one diagnostic per omitted field, in declared
 * order.
 *
 * V2a-T stubs this as an inert no-op (returns no diagnostics); the paired V2a
 * implementation leaf computes the omitted-field set.
 */
export function checkObjectLiteralFields(
  _schema: ObjectSchemaSpec,
  _presentFields: readonly string[],
  _site: LiteralCheckSite,
): Diagnostic[] {
  return [];
}
