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
//   - Ceiling #4 at this site: the JSON-document depth walk over the MERGED
//     `args` runs BEFORE the AJV call (CIO-3), so a depth-6 merged payload
//     short-circuits AJV and cross-routes into ceiling #3's AJV-on-`args`
//     class (CIO-1). This is enforcement point #4 of schema-subset.md
//     §"Depth Enforcement"; the verdict is surfaced as a
//     `BinderArgsClassification` the binder path routes on.
//
// Spec: binder/defaulting-system-note-echo.md §Defaulting
// (#post-default-merge-ajv-validation); schema-subset.md §"Depth Enforcement"
// (enforcement point #4, the walk-before-AJV ordering);
// hard-ceilings/ceilings-3-and-4.md CIO-1 / CIO-3.

import type { CompiledValidator, ValidationError } from "../seams/schema-validator";
import { orderValidationIssues, type ValidationIssue } from "../runtime/query-error";
import { depthWalk } from "../runtime/depth-walk";
import { defineRecordField } from "../runtime/value";
import { classifyBinderArgs, type BinderArgsClassification } from "./retry-taxonomy";

/** One `params:` field that declared a default, with its declared default value. */
export interface DefaultedField {
  /** The field's wire name (the key looked up in the binder-returned `args`). */
  readonly wireName: string;
  /**
   * The field's declared default value, in WIRE form: what AJV validates
   * against the lowered `params` schema, and what a `JSON.parse`d binder
   * `args` value already is — not a theta-side runtime value.
   * `#recoverDeclaredDefaults` (`production-theta-producer.ts`) is this
   * field's one producer and projects the body evaluator's runtime value to
   * this form before returning it.
   */
  readonly defaultValue: unknown;
}

/** Inputs to the fill-if-absent + post-default-merge validation step. */
export interface FillDefaultsInput {
  /** The binder-returned `args` (the `ok` arm's `args`), before defaulting. */
  readonly binderArgs: Readonly<Record<string, unknown>>;
  /** The theta's defaulted `params:` fields (wire name + declared default). */
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
  /**
   * The post-default-merge AJV validation verdict for the merged `args`. On a
   * ceiling-#4 depth breach AJV never runs (CIO-3 short-circuits it), so the
   * verdict is `{ ok: false, errors: [] }`: the merged args did not pass this
   * site, and AJV contributed no issues because it was not asked. The breach's
   * own canonical issue travels on {@link FillDefaultsResult.classification}.
   */
  readonly validation: PostMergeValidation;
  /**
   * The `params`-boundary classification of the merged `args` (CIO-1 / CIO-3):
   * `ok`, or the AJV-on-`args` class carrying the rendered `<ajv-summary>` —
   * the depth-walk single-issue form on a breach, the joined AJV summary
   * otherwise. This is the verdict the binder path routes on.
   */
  readonly classification: BinderArgsClassification;
}

/**
 * Project the compiled validator's `ValidationError[]` onto the
 * `ValidationIssue` shape `renderAjvSummary` joins, then apply ERR-14's
 * canonical ascending sort — the tuple (path, schema_keyword, message),
 * compared by Unicode code point (errors-and-results/queryerror-variants.md;
 * `orderValidationIssues`, `../runtime/query-error.ts`) — before the
 * classifier sees them. Bug 0066 §Fix constraint 2 requires "canonical
 * `validation_errors` order" explicitly: relying on one AJV build's own
 * traversal order would make `<ajv-summary>` reproducible only by accident of
 * that traversal, not by the spec's own contract, which the canonical sort
 * makes stable across conforming validators regardless of schema shape.
 */
function toValidationIssues(
  errors: readonly ValidationError[],
): readonly ValidationIssue[] {
  return orderValidationIssues(
    errors.map((error) => ({
      path: error.instancePath,
      message: error.message,
      schema_keyword: error.keyword,
    })),
  );
}

/**
 * Fill absent defaulted fields (fill-if-absent, keyed on wire name), run the
 * ceiling-#4 depth walk over the merged `args`, and — only when the walk is
 * clean — re-validate the merged `args` through the compiled validator
 * (§Defaulting, #post-default-merge-ajv-validation; CIO-3's walk-before-AJV
 * ordering at this site).
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
      // A field's wire name is author-controlled; see `defineRecordField`'s
      // doc-comment for why the fill must be a define, not an assignment.
      // `merged` is a fresh spread literal (`:133`), so it is extensible, and
      // the define below installs a configurable+writable data descriptor —
      // the own key exists for every wire name once this line runs, so the
      // report on the next line and the record it describes can never
      // diverge.
      defineRecordField(merged, field.wireName, field.defaultValue);
      defaultedWireNames.push(field.wireName);
    }
  }

  // CIO-3: ceiling #4's depth walk is the FIRST sub-check at this AJV boundary,
  // over the merged document. A breach short-circuits the AJV step entirely —
  // the summary is synthesised from the walk's own canonical issue, never from
  // an AJV `errors` traversal — and cross-routes into ceiling #3's
  // AJV-on-`args` class (CIO-1).
  const depth = depthWalk(merged);
  if (!depth.ok) {
    return {
      args: merged,
      defaultedWireNames,
      validation: { ok: false, errors: [] },
      classification: classifyBinderArgs({ depth, ajvIssues: [] }),
    };
  }

  // Post-default-merge AJV validation: re-validate the MERGED args (defaults
  // filled in) against the lowered params schema and surface the verdict.
  const validation = input.validator.validate(merged);

  return {
    args: merged,
    defaultedWireNames,
    validation,
    classification: classifyBinderArgs({
      depth,
      ajvIssues: validation.ok ? [] : toValidationIssues(validation.errors),
    }),
  };
}
