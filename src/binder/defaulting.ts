// V11g / V11g-T — Fill-if-absent defaulting and post-merge AJV validation.
//
// This module owns the runtime default-fill and the post-default-merge AJV
// validation named in binder/defaulting-system-note-echo.md §Defaulting
// (anchor #post-default-merge-ajv-validation, coverage-matrix `cka-40`):
//
//   - Fill-if-absent (keyed on the field's wire name in the binder-returned
//     `args`): when a defaulted field's wire name is ABSENT, the field takes its
//     declared default and is reported as default-supplied; when the wire name
//     is PRESENT, the binder-supplied value is preserved unchanged and no default
//     is applied (even for a defaulted field), and it is NOT reported as
//     default-supplied.
//   - Post-default-merge AJV validation: after the merge, `SchemaValidator`'s
//     compiled validator re-validates the merged `args` object against the
//     lowered `params` schema, and the verdict is surfaced.
//
// Spec: binder/defaulting-system-note-echo.md §Defaulting
// (#post-default-merge-ajv-validation).

import type { CompiledValidator, ValidationError } from "../seams/schema-validator";

/** One `params:` field that declared a default, with its declared default value. */
export interface DefaultedField {
  /** The field's wire name (the key looked up in the binder-returned `args`). */
  readonly wireName: string;
  /** The field's declared default value (a literal-sublanguage form, already lowered). */
  readonly defaultValue: unknown;
}

/** Inputs to the fill-if-absent + post-default-merge validation step. */
export interface FillDefaultsInput {
  /** The binder-returned `args` (the `ok` arm's `args`), before defaulting. */
  readonly binderArgs: Readonly<Record<string, unknown>>;
  /** The loom's defaulted `params:` fields (wire name + declared default). */
  readonly defaults: readonly DefaultedField[];
  /**
   * The compiled validator for the lowered `params` schema (from
   * `SchemaValidator.compile()`). Its `validate()` re-validates the merged args.
   */
  readonly validator: CompiledValidator;
}

/** The verdict of the post-default-merge AJV validation of the merged `args`. */
export type PostMergeValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/** The result of filling defaults and re-validating the merged `args`. */
export interface FillDefaultsResult {
  /** The merged `args`: binder values preserved, absent defaulted fields filled. */
  readonly args: Readonly<Record<string, unknown>>;
  /**
   * The wire names of the fields that took their declared default this run
   * (default-supplied only — a binder-supplied value for a defaulted field is
   * NOT listed). Drives the echo's `(default)` tagging.
   */
  readonly defaultedWireNames: readonly string[];
  /** The post-default-merge AJV validation verdict for the merged `args`. */
  readonly validation: PostMergeValidation;
}

/**
 * Fill absent defaulted fields (fill-if-absent, keyed on wire name) and then
 * re-validate the merged `args` through the compiled validator
 * (§Defaulting, #post-default-merge-ajv-validation).
 */
export function fillDefaultsAndRevalidate(
  input: FillDefaultsInput,
): FillDefaultsResult {
  // Fill-if-absent, keyed on the field's wire name in the binder-returned args:
  // start from the binder-supplied args (preserved unchanged), then for each
  // defaulted field whose wire name is ABSENT, fill its declared default and
  // record it as default-supplied. A present wire name is preserved and NOT
  // reported — even when the binder emitted a value for a defaulted field.
  const merged: Record<string, unknown> = { ...input.binderArgs };
  const defaultedWireNames: string[] = [];
  for (const field of input.defaults) {
    if (!Object.prototype.hasOwnProperty.call(input.binderArgs, field.wireName)) {
      merged[field.wireName] = field.defaultValue;
      defaultedWireNames.push(field.wireName);
    }
  }

  // Post-default-merge AJV validation: re-validate the MERGED args (defaults
  // filled in) against the lowered params schema and surface the verdict.
  const validation = input.validator.validate(merged);

  return { args: merged, defaultedWireNames, validation };
}
