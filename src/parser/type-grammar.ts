// V2a / V2a-T — the type-grammar parser seam.
//
// This module owns the type-expression grammar of grammar.md §"Type grammar"
// and type-system.md: the primitive / named / generic (`array` arity 1,
// `Result` arity 2) / inline-object / union / literal type forms, the
// return-only `void` annotation, and the `array<T>` literal type-sink rule of
// grammar.md §"array<T> literal type-sink rule".
//
// The position-sensitive checks need the surrounding annotation context the
// tokeniser does not carry, so the seam takes an explicit `TypePosition`:
//
//   - `loom/parse/generic-arity-mismatch` — a closed-set generic constructor
//     (`array`/`Result`) applied with the wrong type-argument count; position-
//     independent.
//   - `loom/parse/void-in-non-return-position` — `void` in any `Type` position
//     other than a function/loom return type.
//   - `loom/parse/result-in-schema-position` — a `Result<T, E>` application in a
//     lowered-schema position (a schema field type, a `params:` field type, or
//     any type reachable transitively from those, including `array<T>` element
//     types and union arms).
//
// The `array<T>` literal type-sink rule of grammar.md fires
// `loom/parse/array-no-common-type` when an `[]` / `[expr, ...]` literal has no
// resolving sink and its elements alone cannot determine a common type. The
// sink set is exhaustive (binding annotation, function parameter, surrounding
// constructor field, enclosing array element); the `for x in expr` iterand is
// explicitly NOT a sink.
//
// V2a-T (tests-task) declares these seam shapes and stubs the two checks as
// inert no-ops (no diagnostic produced) so the failing tests compile and red on
// their own primary assertions (the type-expression parser and sink-resolution
// engine are absent). The paired V2a implementation leaf fills them in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/**
 * The annotation position a type expression occupies, which governs the
 * `void` and `Result` position rules of grammar.md §"Type grammar":
 *
 *   - `return`         — a function / loom return type: `void` is admitted here
 *                        and `Result` is admitted (not a lowered-schema site).
 *   - `value`          — a non-schema value position (`let` annotation, `fn`
 *                        parameter type, generic argument outside a lowered
 *                        schema, `invoke<T>` / type ascription, union arm):
 *                        `void` is rejected, `Result` is admitted.
 *   - `schema-feeding` — a lowered-schema position (a schema field type, a
 *                        `params:` field type, or any type transitively
 *                        reachable from those): both `void` and `Result` are
 *                        rejected.
 */
export type TypePosition = "return" | "value" | "schema-feeding";

/** A located site at which a type expression is parsed and checked. */
export interface TypeCheckSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Parse a single type expression as written in source and apply the
 * position-sensitive type-grammar checks, returning every diagnostic raised
 * (in source order). The closed `GenericType` arity check
 * (`loom/parse/generic-arity-mismatch`) is position-independent; the
 * `loom/parse/void-in-non-return-position` and `loom/parse/result-in-schema-position`
 * checks consult `position`.
 *
 * V2a-T stubs this as an inert no-op (returns no diagnostics); the paired V2a
 * implementation leaf parses the type AST and applies the checks.
 */
export function parseTypeExpression(
  _source: string,
  _position: TypePosition,
  _site: TypeCheckSite,
): Diagnostic[] {
  return [];
}

/**
 * The surrounding context of an `[]` / `[expr, ...]` array literal, selecting
 * whether a *type sink* is available (grammar.md §"array<T> literal type-sink
 * rule"). The sink set is exhaustive:
 *
 *   - `binding-annotation`  — `let xs: array<T> = ...`.
 *   - `fn-param`            — a function parameter type at a call site.
 *   - `constructor-field`   — a surrounding constructor field's declared type.
 *   - `array-element`       — the element type of an enclosing array-typed sink
 *                             (recursive descent).
 *   - `for-iterand`         — the iterand of `for x in expr`. NOT a sink: `for`
 *                             cannot supply `T` to `[]`.
 *   - `none`                — no surrounding sink (e.g. `let xs = []`).
 */
export type ArraySinkContext =
  | "binding-annotation"
  | "fn-param"
  | "constructor-field"
  | "array-element"
  | "for-iterand"
  | "none";

/** A located site at which an array literal's element type is resolved. */
export interface ArrayLiteralSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Resolve an array literal's element type against its surrounding sink.
 * Returns `loom/parse/array-no-common-type` when the literal's elements alone
 * cannot determine a common type (an empty literal, or heterogeneous elements
 * with no shared type) and the surrounding `context` supplies no sink — the
 * `for-iterand` and `none` contexts both leave the literal unsunk, so an `[]`
 * in either fires. A real sink (`binding-annotation`, `fn-param`,
 * `constructor-field`, `array-element`) returns `undefined`.
 *
 * V2a-T stubs this as an inert no-op (returns `undefined`); the paired V2a
 * implementation leaf computes the element LUB and the sink resolution.
 */
export function checkArrayCommonType(
  _context: ArraySinkContext,
  _elementTypes: readonly string[],
  _site: ArrayLiteralSite,
): Diagnostic | undefined {
  return undefined;
}
