// V2c / V2c-T — the runtime value model and structural-equality seam.
//
// This module owns the interpreter representation of Loom values and the
// structural-equality relation of runtime-value-model.md (the RVM code-keyed
// obligation area — no numbered REQ-IDs):
//
//   - The value representation table: Loom `string`/`number`/`integer`/
//     `boolean`/`null`/`array<T>`/object-schema values are native JS values;
//     an *enum variant* carries the variant's wire string plus an
//     interpreter-private declaring-enum tag (the tag MUST NOT appear in JSON
//     output — `JSON.stringify` of an enum value yields the bare wire string);
//     a `Result<T, E>` is internally tagged with an `Ok`/`Err` discriminator
//     carrying the payload and is never lowered to wire (it has no lowered-
//     schema form, so a `Result` value never crosses the wire).
//   - Structural equality (`==`): cross-type compares to `false` (no parse
//     diagnostic, no runtime panic); primitives compare by value with the two
//     fixed refinements `NaN == NaN` is `true` and `+0 == -0` is `true`; arrays
//     compare element-wise at equal length; objects compare loom-side key set
//     and per-key value (declaration order irrelevant); enum variants compare
//     the declaring-enum tag *and* the wire value (`Severity.High ==
//     OtherEnum.High` is `false` even when wire values match); `Result`
//     compares the `Ok`/`Err` discriminator and recurses on the payload. The
//     subtype case `42 == 42.0` is `true` because `integer ⊑ number` routes the
//     pair to per-shape value comparison.
//
// V2c-T (tests-task) declares the seam shapes — `LoomValue`, the opaque
// `EnumValue`, the `ResultValue` discriminated union, the `makeEnumValue` /
// `makeOk` / `makeErr` constructors, the `valuesEqual` structural-equality
// relation, and the `isWireLowerable` predicate — and stubs the behaviour-
// bearing functions inertly so the failing tests compile and red on their own
// primary assertions (the declaring-enum-tagged representation, the structural-
// equality relation, and the `Result`-not-lowerable recognition are absent).
// The paired V2c implementation leaf fills these in.

/** Brand marking a value as a Loom enum runtime value (type-level only). */
declare const enumBrand: unique symbol;

/**
 * The interpreter-private property name carrying an enum value's declaring-enum
 * tag. It is installed **non-enumerable** so `JSON.stringify` of the boxed-
 * string enum value yields the bare wire string and the tag never appears in
 * JSON output (runtime-value-model.md, value-representation table, enum row).
 */
const ENUM_TAG = "__loomEnum";

/**
 * An enum runtime value. Carries the variant's wire string plus an
 * interpreter-private declaring-enum tag identifying the declaring enum.
 * `JSON.stringify` of an enum value yields the **bare wire string** — the tag
 * never appears in JSON output (runtime-value-model.md, value-representation
 * table, enum row). Opaque: construct only via `makeEnumValue`; the concrete
 * in-memory shape is an implementation detail not reachable from Loom code and
 * may change without a spec revision.
 */
export type EnumValue = { readonly [enumBrand]: "loom-enum" };

/**
 * A `Result<T, E>` runtime value: internally tagged with an `Ok`/`Err`
 * discriminator carrying the payload (runtime-value-model.md, value-
 * representation table, `Result` row). Loom code observes `Result` only through
 * `Ok` / `Err` constructors, `match`, and `?`; `Result` has no lowered-schema
 * form and never crosses the wire.
 */
export type ResultValue =
  | { readonly ok: true; readonly value: LoomValue }
  | { readonly ok: false; readonly error: LoomValue };

/**
 * The interpreter representation of any Loom value (runtime-value-model.md,
 * value-representation table): a JS primitive (`string` / `number` covers both
 * `number` and `integer` / `boolean` / `null`), a JS array (`array<T>`), a JS
 * plain object keyed by loom-side names (object schema), an enum variant, or a
 * `Result`.
 */
export type LoomValue =
  | string
  | number
  | boolean
  | null
  | readonly LoomValue[]
  | { readonly [key: string]: LoomValue }
  | EnumValue
  | ResultValue;

/**
 * Construct an enum runtime value for `wire` declared by enum `declaringEnum`.
 * The resulting value carries the wire string plus the interpreter-private
 * declaring-enum tag, and `JSON.stringify` of it yields the bare wire string.
 *
 * The reference encoding is a non-enumerable `__loomEnum` tag installed on a
 * boxed `String`: `JSON.stringify` of a boxed string yields the bare wire
 * string, and the non-enumerable tag is excluded from JSON output, so the value
 * serialises to the bare wire string while still carrying its declaring-enum
 * tag for cross-enum equality. The concrete shape is an implementation detail
 * not reachable from Loom code.
 */
export function makeEnumValue(declaringEnum: string, wire: string): EnumValue {
  const boxed = new String(wire);
  Object.defineProperty(boxed, ENUM_TAG, {
    value: declaringEnum,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return boxed as unknown as EnumValue;
}

/** The declaring-enum tag of `value` if it is an enum value, else `undefined`. */
function enumTagOf(value: LoomValue): string | undefined {
  if (typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, ENUM_TAG)) {
    return (value as unknown as Record<string, string>)[ENUM_TAG];
  }
  return undefined;
}

/** Whether `value` is a `Result` runtime value (carries an `ok` discriminator). */
function isResultValue(value: LoomValue): value is ResultValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    enumTagOf(value) === undefined &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

/** Construct an `Ok(value)` `Result` runtime value. */
export function makeOk(value: LoomValue): ResultValue {
  return { ok: true, value };
}

/** Construct an `Err(error)` `Result` runtime value. */
export function makeErr(error: LoomValue): ResultValue {
  return { ok: false, error };
}

/**
 * The structural deep-equality relation of runtime-value-model.md §Equality
 * (the `==` operator). Cross-type pairs compare `false`; primitives compare by
 * value with `NaN == NaN` true and `+0 == -0` true; arrays compare element-wise
 * at equal length; objects compare loom-side key set and per-key value; enum
 * variants compare the declaring-enum tag *and* the wire value; `Result`
 * compares the discriminator and recurses on the payload. Never panics and
 * never raises a diagnostic — a cross-type comparison simply evaluates `false`.
 *
 */
export function valuesEqual(a: LoomValue, b: LoomValue): boolean {
  // Enum variants compare the declaring-enum tag *and* the wire value; an enum
  // against a non-enum (e.g. `Severity.Low == "low"`) is a cross-type pair.
  const tagA = enumTagOf(a);
  const tagB = enumTagOf(b);
  if (tagA !== undefined || tagB !== undefined) {
    if (tagA === undefined || tagB === undefined) {
      return false;
    }
    return tagA === tagB && String(a) === String(b);
  }

  // `Result` compares the `Ok`/`Err` discriminator and recurses on the payload.
  const resA = isResultValue(a);
  const resB = isResultValue(b);
  if (resA || resB) {
    if (!resA || !resB) {
      return false;
    }
    if (a.ok !== b.ok) {
      return false;
    }
    return a.ok && b.ok
      ? valuesEqual(a.value, b.value)
      : valuesEqual((a as { error: LoomValue }).error, (b as { error: LoomValue }).error);
  }

  // Arrays compare element-wise at equal length.
  const arrA = Array.isArray(a);
  const arrB = Array.isArray(b);
  if (arrA || arrB) {
    if (!arrA || !arrB || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // Objects compare loom-side key set and per-key value (declaration order
  // irrelevant).
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    const objA = a as { readonly [key: string]: LoomValue };
    const objB = b as { readonly [key: string]: LoomValue };
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(objB, key)) {
        return false;
      }
      if (!valuesEqual(objA[key] as LoomValue, objB[key] as LoomValue)) {
        return false;
      }
    }
    return true;
  }

  // Primitives compare by value, with the two fixed refinements: `NaN == NaN`
  // is `true`, and `+0 == -0` is `true` (`===` already equates `+0`/`-0`). A
  // cross-type primitive pair (differing `typeof`, or object-vs-primitive)
  // falls through to a `false` here — never a panic, never a diagnostic.
  if (typeof a === "number" && typeof b === "number") {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  return a === b;
}

/**
 * Whether a runtime value has a lowered-schema (wire) form. A `Result` value is
 * **never** lowerable — it has no lowered-schema form and never crosses the
 * wire (runtime-value-model.md, value-representation table, `Result` row).
 * Plain primitives, arrays, objects, and enum variants are lowerable.
 *
 */
export function isWireLowerable(value: LoomValue): boolean {
  return !isResultValue(value);
}
