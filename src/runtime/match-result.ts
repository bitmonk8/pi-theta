// V4a / V4a-T — the runtime `match`-evaluation seam.
//
// This module owns the runtime dispatch of a `match` expression over the six
// theta 1.0 pattern forms of expressions.md §"Pattern grammar (theta 1.0)" —
// wildcard, identifier, literal, constructor, object/schema, and array — and
// the `theta/runtime/match-error` panic (the implementation refers to it as
// `MatchError`) that fires when a scrutinee value matches none of a `match`'s
// arms (errors-and-results/error-model.md §"Runtime panics"; theta 1.0 does not
// statically check exhaustiveness, per expressions.md §"Exhaustiveness").
//
// V4a-T (tests-task) declares the seam — the `Pattern` model, the `MatchArm`
// shape, the `MatchError` panic class, and the `evaluateMatch` entry point —
// and asserts only the raise-versus-bind exhaustion behaviour: a scrutinee
// matching one of the six pattern forms binds and evaluates the selected arm,
// while a scrutinee matching none raises `MatchError`. The panic's `?`/`match`
// bypass and its registered `theta/runtime/match-error` message template are
// deferred to and closed by V4b-T, so V4a-T does not assert the message string.
//
// `evaluateMatch` is stubbed inert (it matches no arm and raises no panic), so
// the raise-versus-bind tests red on their own primary assertions (no thrown
// `MatchError`, and a sentinel return value rather than the selected arm's
// value), not on a compile error, a missing fixture, or a harness throw. The
// paired V4a implementation leaf fills it in.

import { type ThetaValue, defineRecordField, isObjectValue, isResultValue, valuesEqual } from "./value";
import { ThetaPanic } from "./runtime-panics";

/** The registry code carried by the non-exhaustive-`match` runtime panic. */
export const MATCH_ERROR_CODE = "theta/runtime/match-error";

/**
 * The non-exhaustive-`match` runtime panic (errors-and-results/error-model.md
 * §"Runtime panics"; the implementation refers to it as `MatchError`). Carries
 * the `theta/runtime/match-error` registry code. The registered message-template
 * formatting and the `?`/`match` bypass routing are closed by V4b. It is a
 * `ThetaPanic` so the runtime-defect surface (`surfaceUnexpectedThrow`)
 * recognises it as one of the six closed panic sources rather than
 * reclassifying it as `theta/runtime/internal-error`.
 */
export class MatchError extends ThetaPanic {
  readonly code = MATCH_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = "MatchError";
  }
}

/**
 * Render the `<scrutinee summary>` of a non-exhaustive-`match` panic per the
 * category-2 runtime-value placeholder rule (diagnostics/placeholder-
 * rendering-a.md): integers/numbers as their shortest decimal (`-0` normalised
 * to `0`), booleans / `null` literally, strings truncated past 80 code points
 * to 77-code-points-plus-`...`, enum variants as their bare wire string,
 * `Result` values as `Ok(<inner>)` / `Err(<inner>)`, and arrays / schema-typed
 * objects as compact `JSON.stringify` (the schema name does not surface).
 */
function summariseScrutinee(value: ThetaValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    const codePoints = Array.from(value);
    return codePoints.length <= 80 ? value : codePoints.slice(0, 77).join("") + "...";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Object.is(value, -0) ? "0" : String(value);
  }
  // An enum runtime value is a boxed `String`; it renders as its bare wire
  // string (the declaring-enum tag never surfaces).
  if (value instanceof String) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  // A `Result` value renders as `Ok(<inner>)` / `Err(<inner>)`. Classified by
  // the constructor-installed brand, never the `ok` shape — a user object
  // carrying a boolean `ok` field is a schema-typed object (bug 0017).
  if (isResultValue(value)) {
    return value.ok
      ? `Ok(${summariseScrutinee(value.value)})`
      : `Err(${summariseScrutinee(value.error)})`;
  }
  // Any other schema-typed object: compact `JSON.stringify`.
  return JSON.stringify(value);
}

/**
 * One of the six theta 1.0 `match` pattern forms (expressions.md §"Pattern
 * grammar (theta 1.0)"):
 *
 *   - `wildcard`    — `_`: matches anything, binds nothing.
 *   - `identifier`  — `x`: matches anything, binds the value to `name`.
 *   - `literal`     — `"validation"`, `0`, `true`, `null`: matches by structural
 *                     equality against `value`.
 *   - `constructor` — `Ok(p)` / `Err(p)`: matches the named `Result` variant and
 *                     recurses into `inner`.
 *   - `object`      — `Schema { field: p, ... }`: matches an object whose listed
 *                     `fields` match their inner patterns; unlisted fields are
 *                     ignored.
 *   - `array`       — `[a, b]`: matches an exact-length array, each slot against
 *                     its pattern.
 */
export type Pattern =
  | { readonly kind: "wildcard" }
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "literal"; readonly value: ThetaValue }
  | { readonly kind: "constructor"; readonly ctor: "Ok" | "Err"; readonly inner: Pattern }
  | {
      readonly kind: "object";
      readonly fields: readonly { readonly name: string; readonly pattern: Pattern }[];
    }
  | { readonly kind: "array"; readonly elements: readonly Pattern[] };

/** The bindings a matched pattern introduces (identifier name → bound value). */
export type Bindings = Readonly<Record<string, ThetaValue>>;

/**
 * One `match` arm: a `pattern` and a `body` evaluated with the bindings the
 * pattern introduces. The body is a thunk so a non-selected arm's body is never
 * evaluated (expressions.md §`match` expression — arms evaluate to a value).
 */
export interface MatchArm {
  readonly pattern: Pattern;
  readonly body: (bindings: Bindings) => ThetaValue;
}

/**
 * Evaluate a `match` expression: dispatch `scrutinee` against `arms` in order,
 * first matching arm wins, and evaluate the selected arm's `body` with the
 * bindings its pattern introduces. When `scrutinee` matches none of the arms,
 * raise `MatchError` (`theta/runtime/match-error`) — theta 1.0 performs no static
 * exhaustiveness check, so non-exhaustion surfaces at runtime
 * (expressions.md §"Exhaustiveness").
 *
 * V4a-T stubs this inert: it matches no arm and raises no panic, returning a
 * sentinel. The paired V4a leaf implements pattern dispatch, binding, and the
 * `MatchError` raise.
 */
export function evaluateMatch(
  scrutinee: ThetaValue,
  arms: readonly MatchArm[],
): ThetaValue {
  // First matching arm wins; a non-selected arm's body is never evaluated.
  for (const arm of arms) {
    const bindings: Record<string, ThetaValue> = {};
    if (matchPattern(arm.pattern, scrutinee, bindings)) {
      return arm.body(bindings);
    }
  }
  // The scrutinee matched none of the six pattern forms: raise the runtime
  // non-exhaustive-`match` panic carrying its registered message template
  // (`MatchError: no arm matched <scrutinee summary>`,
  // diagnostics/code-registry-runtime.md). theta 1.0 performs no static
  // exhaustiveness check (expressions.md §"Exhaustiveness").
  throw new MatchError(`MatchError: no arm matched ${summariseScrutinee(scrutinee)}`);
}

/**
 * Attempt to match `value` against `pattern`, recording any identifier bindings
 * the pattern introduces into `bindings`. Returns whether the pattern matched.
 * On a failed match the partial `bindings` are discarded by the caller (a fresh
 * map per arm), so a partially-populated map never leaks into a later arm.
 */
function matchPattern(
  pattern: Pattern,
  value: ThetaValue,
  bindings: Record<string, ThetaValue>,
): boolean {
  switch (pattern.kind) {
    case "wildcard":
      return true;
    case "identifier":
      defineRecordField(bindings, pattern.name, value);
      return true;
    case "literal":
      return valuesEqual(value, pattern.value);
    case "constructor": {
      // `Ok(p)` / `Err(p)` match the named `Result` variant and recurse into the
      // payload. The scrutinee must be a genuine constructor-built `Result` —
      // classification is by the interpreter-private brand, never the `ok`
      // shape, so user data `{ ok: boolean, … }` matches no constructor pattern
      // (bug 0017).
      if (!isResultValue(value)) {
        return false;
      }
      if (pattern.ctor === "Ok") {
        if (!value.ok) {
          return false;
        }
        return matchPattern(pattern.inner, value.value, bindings);
      }
      if (value.ok) {
        return false;
      }
      return matchPattern(pattern.inner, value.error, bindings);
    }
    case "object": {
      // An object/schema pattern matches an object whose listed fields match
      // their inner patterns; unlisted fields are ignored.
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return false;
      }
      // Enum and Result carriers satisfy JS `typeof "object"` but carry no
      // field surface in the language's value model, so they must not take
      // the object/schema arm even though the typeof/null/array guard above
      // lets them through structurally.
      if (!isObjectValue(value)) {
        return false;
      }
      const obj = value as { readonly [key: string]: ThetaValue };
      for (const field of pattern.fields) {
        if (!Object.prototype.hasOwnProperty.call(obj, field.name)) {
          return false;
        }
        if (!matchPattern(field.pattern, obj[field.name] as ThetaValue, bindings)) {
          return false;
        }
      }
      return true;
    }
    case "array": {
      // An array pattern matches an exact-length array, each slot against its
      // pattern.
      if (!Array.isArray(value) || value.length !== pattern.elements.length) {
        return false;
      }
      for (let i = 0; i < pattern.elements.length; i++) {
        if (!matchPattern(pattern.elements[i] as Pattern, value[i] as ThetaValue, bindings)) {
          return false;
        }
      }
      return true;
    }
  }
}
