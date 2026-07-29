// V2c / V2c-T — the runtime value model and structural-equality seam.
//
// This module owns the interpreter representation of Theta values and the
// structural-equality relation of runtime-value-model.md (the RVM code-keyed
// obligation area — no numbered REQ-IDs):
//
//   - The value representation table: Theta `string`/`number`/`integer`/
//     `boolean`/`null`/`array<T>`/object-schema values are native JS values;
//     an *enum variant* carries the variant's wire string plus an
//     interpreter-private declaring-enum tag (the tag MUST NOT appear in JSON
//     output — `JSON.stringify` of an enum value yields the bare wire string);
//     a `Result<T, E>` is internally tagged with an `Ok`/`Err` discriminator
//     carrying the payload, guarded by an interpreter-private non-enumerable
//     brand (`__thetaResult`) so a user/model object that happens to carry a
//     boolean `ok` field can never classify as a `Result` (type-system.md
//     `Result` row: "observed only via constructors"; bug 0017); a `Result` is
//     never lowered to wire (it has no lowered-schema form, so a `Result`
//     value never crosses the wire).
//   - Structural equality (`==`): cross-type compares to `false` (no parse
//     diagnostic, no runtime panic); primitives compare by value with the two
//     fixed refinements `NaN == NaN` is `true` and `+0 == -0` is `true`; arrays
//     compare element-wise at equal length; objects compare theta-side key set
//     and per-key value (declaration order irrelevant); enum variants compare
//     the declaring-enum tag *and* the wire value (`Severity.High ==
//     OtherEnum.High` is `false` even when wire values match); `Result`
//     compares the `Ok`/`Err` discriminator and recurses on the payload. The
//     subtype case `42 == 42.0` is `true` because `integer ⊑ number` routes the
//     pair to per-shape value comparison.
//
// V2c-T (tests-task) declares the seam shapes — `ThetaValue`, the opaque
// `EnumValue`, the `ResultValue` discriminated union, the `makeEnumValue` /
// `makeOk` / `makeErr` constructors, the `valuesEqual` structural-equality
// relation, and the `isWireLowerable` predicate — and stubs the behaviour-
// bearing functions inertly so the failing tests compile and red on their own
// primary assertions (the declaring-enum-tagged representation, the structural-
// equality relation, and the `Result`-not-lowerable recognition are absent).
// The paired V2c implementation leaf fills these in.

/** Brand marking a value as a Theta enum runtime value (type-level only). */
declare const enumBrand: unique symbol;

/**
 * The interpreter-private property name carrying an enum value's declaring-enum
 * tag. It is installed **non-enumerable** so `JSON.stringify` of the boxed-
 * string enum value yields the bare wire string and the tag never appears in
 * JSON output (runtime-value-model.md, value-representation table, enum row).
 */
const ENUM_TAG = "__thetaEnum";

/**
 * An enum runtime value. Carries the variant's wire string plus an
 * interpreter-private declaring-enum tag identifying the declaring enum.
 * `JSON.stringify` of an enum value yields the **bare wire string** — the tag
 * never appears in JSON output (runtime-value-model.md, value-representation
 * table, enum row). Opaque: construct only via `makeEnumValue`; the concrete
 * in-memory shape is an implementation detail not reachable from Theta code and
 * may change without a spec revision.
 */
export type EnumValue = { readonly [enumBrand]: "theta-enum" };

/** Brand marking a value as a constructor-built `Result` (type-level only). */
declare const resultBrand: unique symbol;

/**
 * The interpreter-private property name branding a `Result` runtime value.
 * Installed **non-enumerable** by `makeOk` / `makeErr` — mirroring the enum
 * tag — so it never appears in JSON output, `Object.keys`, or the
 * {@link valuesEqual} key walk. {@link isResultValue} tests this brand, not the
 * `{ ok: boolean }` shape: user/model data carrying a boolean `ok` field must
 * never classify as (or forge) a `Result` (type-system.md, `Result` row —
 * "observed only via constructors"; bug 0017).
 */
const RESULT_TAG = "__thetaResult";

/**
 * A `Result<T, E>` runtime value: internally tagged with an `Ok`/`Err`
 * discriminator carrying the payload (runtime-value-model.md, value-
 * representation table, `Result` row). Construct only via `makeOk` / `makeErr`
 * — they install the interpreter-private non-enumerable `__thetaResult` brand
 * that `isResultValue` classifies by (the type-level `resultBrand` member
 * forces literal construction through the constructors). Theta code observes
 * `Result` only through `Ok` / `Err` constructors, `match`, and `?`; `Result`
 * has no lowered-schema form and never crosses the wire.
 */
export type ResultValue = (
  | { readonly ok: true; readonly value: ThetaValue }
  | { readonly ok: false; readonly error: ThetaValue }
) & { readonly [resultBrand]: "theta-result" };

/**
 * The interpreter representation of any Theta value (runtime-value-model.md,
 * value-representation table): a JS primitive (`string` / `number` covers both
 * `number` and `integer` / `boolean` / `null`), a JS array (`array<T>`), a JS
 * plain object keyed by theta-side names (object schema), an enum variant, or a
 * `Result`.
 */
export type ThetaValue =
  | string
  | number
  | boolean
  | null
  | readonly ThetaValue[]
  | { readonly [key: string]: ThetaValue }
  | EnumValue
  | ResultValue;

/**
 * Construct an enum runtime value for `wire` declared by enum `declaringEnum`.
 * The resulting value carries the wire string plus the interpreter-private
 * declaring-enum tag, and `JSON.stringify` of it yields the bare wire string.
 *
 * The reference encoding is a non-enumerable `__thetaEnum` tag installed on a
 * boxed `String`: `JSON.stringify` of a boxed string yields the bare wire
 * string, and the non-enumerable tag is excluded from JSON output, so the value
 * serialises to the bare wire string while still carrying its declaring-enum
 * tag for cross-enum equality. The concrete shape is an implementation detail
 * not reachable from Theta code.
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

/**
 * The value of the interpreter-private brand `tag` on `value`, or `undefined`
 * when `value` carries no genuine brand. One privacy posture for all three
 * tags (`ENUM_TAG` / `SCHEMA_TAG` / `RESULT_TAG`): a brand is genuine only
 * when the own-property descriptor exists AND is non-enumerable — exactly as
 * the constructors (`makeEnumValue` / `brandSchemaValue` / `brandResult`)
 * install it. Key presence is never consulted: JSON parsing and theta-side
 * object construction produce only enumerable keys, so an enumerable
 * same-named key is ordinary user/model data, not a brand — accepting one
 * would let a wire payload or a parse-clean theta ctor forge an enum, a
 * schema brand, or a `Result` (bugs 0017, 0020). Arrays never carry a brand;
 * the boxed-`String` enum carrier is an object and passes the guard.
 */
function privateBrandOf(value: ThetaValue, tag: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, tag);
  return descriptor !== undefined && !descriptor.enumerable ? descriptor.value : undefined;
}

/**
 * The declaring-enum tag of `value` if it is an enum value, else `undefined`.
 * The brand is the **non-enumerable** descriptor {@link makeEnumValue}
 * installs, never the key name: JSON parsing and theta-side object
 * construction produce only enumerable keys, so an object carrying an
 * enumerable `__thetaEnum` key is ordinary user/model data — it takes the
 * object arm of `==` and the object rule of the QRY-18 render like any other
 * plain object (runtime-value-model.md, enum row: the tag is
 * interpreter-private; bug 0020).
 */
function enumTagOf(value: ThetaValue): string | undefined {
  const brand = privateBrandOf(value, ENUM_TAG);
  return typeof brand === "string" ? brand : undefined;
}

/**
 * The interpreter-private property name recording the declaring `schema` of an
 * object-schema value. Installed **non-enumerable** so it is invisible to every
 * theta-visible object surface — `JSON.stringify`, `Object.keys` / `.entries`
 * (`obj.keys()`), and the {@link valuesEqual} structural relation all iterate
 * enumerable keys only, so the tag never appears in JSON output, never appears
 * in a `keys()` result, and never affects equality (runtime-value-model.md: an
 * object schema is a "JS plain object keyed by theta-side names"). Its sole
 * consumer is the QRY-18 interpolation render path, which needs to recover the
 * declaring schema to apply outbound wire-name translation recursively.
 */
const SCHEMA_TAG = "__thetaSchema";

/**
 * Brand a freshly-constructed object-schema value with its declaring `schema`
 * name, so a later consumer can recover the schema to apply outbound wire-name
 * translation (QRY-18). The tag is installed **non-enumerable**, so the branded
 * value is indistinguishable from a plain object on every theta-visible surface;
 * only {@link schemaTagOf} reads it. Returns the same object for chaining.
 */
export function brandSchemaValue(
  value: { [key: string]: ThetaValue },
  schemaName: string,
): { readonly [key: string]: ThetaValue } {
  Object.defineProperty(value, SCHEMA_TAG, {
    value: schemaName,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return value;
}

/**
 * The declaring-`schema` tag of `value` if it carries one, else `undefined`.
 * Only the **non-enumerable** descriptor {@link brandSchemaValue} installs
 * classifies — an enumerable same-named key is ordinary user/model data, so a
 * wire payload or theta ctor field naming `__thetaSchema` cannot select, by
 * name, which declared schema's theta→wire renames the QRY-18 outbound render
 * applies to its carrying object (bug 0020).
 */
export function schemaTagOf(value: ThetaValue): string | undefined {
  const brand = privateBrandOf(value, SCHEMA_TAG);
  return typeof brand === "string" ? brand : undefined;
}

/**
 * Whether `value` is an enum runtime value (carries the declaring-enum tag). A
 * consumer that must stringify by the QRY-18 rule keys off this to render the
 * bare wire value rather than JSON-quoting the boxed-string representation
 * (runtime-value-model.md, enum row).
 */
export function isEnumValue(value: ThetaValue): value is EnumValue {
  return enumTagOf(value) !== undefined;
}

/**
 * Whether `value` is a `Result` runtime value — i.e. carries the brand exactly
 * as `brandResult` installs it: a **non-enumerable** own `__thetaResult`
 * property. Tag presence alone is insufficient: JSON parsing and theta-side
 * construction produce only enumerable keys, so an enumerable same-named key
 * is ordinary user/model data, not a brand — accepting it would let a wire
 * payload `{"__thetaResult": true, "ok": false, …}` forge an `Err`. Declared
 * object schemas lower closed (`additionalProperties: false`,
 * body-type-lowering.ts) and reject such a payload, but it still enters
 * through permissive `{}` lowerings (forward/self/unresolved refs,
 * query-schema-lowering.ts) and unvalidated ingress (code-tool return
 * payloads, untyped invoke-envelope values). The `{ ok: boolean }` shape is
 * likewise not consulted: an `ok` field is ordinary user/model data (bug
 * 0017). The descriptor check is the shared {@link privateBrandOf} posture —
 * what classifies here is the existence of a **defined** brand value (the
 * constructors install `true`).
 */
export function isResultValue(value: ThetaValue): value is ResultValue {
  return privateBrandOf(value, RESULT_TAG) !== undefined;
}

/**
 * Install the interpreter-private `Result` brand. Non-enumerable — like the
 * enum tag — so the brand is invisible on every theta-visible surface and in
 * JSON output; a clone that walks enumerable keys (JSON, `structuredClone`)
 * drops it, so a boundary that legitimately round-trips a `Result`'s arms must
 * re-enter through `makeOk` / `makeErr` at decode. Non-enumerability doubles
 * as the forgery guard: {@link isResultValue} rejects an enumerable same-named
 * key, which is all JSON/user data can produce.
 */
function brandResult(
  result:
    | { readonly ok: true; readonly value: ThetaValue }
    | { readonly ok: false; readonly error: ThetaValue },
): ResultValue {
  Object.defineProperty(result, RESULT_TAG, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result as ResultValue;
}

/** Construct an `Ok(value)` `Result` runtime value. */
export function makeOk(value: ThetaValue): ResultValue {
  return brandResult({ ok: true, value });
}

/** Construct an `Err(error)` `Result` runtime value. */
export function makeErr(error: ThetaValue): ResultValue {
  return brandResult({ ok: false, error });
}

/**
 * The structural deep-equality relation of runtime-value-model.md §Equality
 * (the `==` operator). Cross-type pairs compare `false`; primitives compare by
 * value with `NaN == NaN` true and `+0 == -0` true; arrays compare element-wise
 * at equal length; objects compare theta-side key set and per-key value; enum
 * variants compare the declaring-enum tag *and* the wire value; `Result`
 * compares the discriminator and recurses on the payload. Never panics and
 * never raises a diagnostic — a cross-type comparison simply evaluates `false`.
 *
 */
export function valuesEqual(a: ThetaValue, b: ThetaValue): boolean {
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
      : valuesEqual((a as { error: ThetaValue }).error, (b as { error: ThetaValue }).error);
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

  // Objects compare theta-side key set and per-key value (declaration order
  // irrelevant). Theta-side keys are ENUMERABLE own keys on BOTH sides — the
  // membership test mirrors the `Object.keys` walk — so an interpreter-private
  // brand can neither satisfy membership for a forged enumerable same-named
  // key nor defeat it (bug 0020).
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    const objA = a as { readonly [key: string]: ThetaValue };
    const objB = b as { readonly [key: string]: ThetaValue };
    for (const key of keysA) {
      if (!Object.prototype.propertyIsEnumerable.call(objB, key)) {
        return false;
      }
      if (!valuesEqual(objA[key] as ThetaValue, objB[key] as ThetaValue)) {
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
export function isWireLowerable(value: ThetaValue): boolean {
  return !isResultValue(value);
}
