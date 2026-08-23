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
//     brand (`RESULT_TAG`) so a user/model object that happens to carry a
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
 * The interpreter-private symbol carrying an enum value's declaring-enum tag.
 * A symbol key is unreachable from `JSON.parse` and from theta-side object
 * construction — both produce string keys only — so the tag can never
 * collide with a declared field of the same name, and the string-keyed
 * surfaces skip it whatever its enumerability: it never appears in
 * `JSON.stringify` output or in `Object.keys` (runtime-value-model.md,
 * value-representation table, enum row). That an enum value serialises to
 * its bare wire string is a separate property of the boxed-`String` carrier
 * {@link makeEnumValue} builds, which installs the tag **non-enumerable** —
 * the posture {@link privateBrandOf} states. The `"__thetaEnum"` description
 * is debug-only, carries no semantics, and exists only so the brand reads
 * legibly under a debugger and greps against the spec and bug docs.
 */
const ENUM_TAG = Symbol("__thetaEnum");

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
 * The interpreter-private symbol branding a `Result` runtime value. A symbol
 * key is unreachable from `JSON.parse` and from theta-side object
 * construction — both produce string keys only — so the tag can never
 * collide with a declared field of the same name, and it reaches neither JSON
 * output, nor `Object.keys`, nor the {@link valuesEqual} key walk: those
 * surfaces are string-keyed and skip it whatever its enumerability. `makeOk`
 * / `makeErr` install it **non-enumerable**, mirroring the enum tag — the
 * posture {@link privateBrandOf} states. {@link isResultValue} tests this
 * brand, not the `{ ok: boolean }` shape: user/model data carrying a boolean
 * `ok` field must never classify as (or forge) a `Result` (type-system.md,
 * `Result` row — "observed only via constructors"; bug 0017). The
 * `"__thetaResult"` description is debug-only, carries no semantics, and
 * exists only so the brand reads legibly under a debugger and greps against
 * the spec and bug docs.
 */
const RESULT_TAG = Symbol("__thetaResult");

/**
 * A `Result<T, E>` runtime value: internally tagged with an `Ok`/`Err`
 * discriminator carrying the payload (runtime-value-model.md, value-
 * representation table, `Result` row). Construct only via `makeOk` / `makeErr`
 * — they install the interpreter-private non-enumerable `RESULT_TAG` symbol
 * brand that `isResultValue` classifies by (the type-level `resultBrand`
 * member forces literal construction through the constructors). Theta code
 * observes `Result` only through `Ok` / `Err` constructors, `match`, and `?`;
 * `Result` has no lowered-schema form and never crosses the wire.
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
 * The reference encoding is a non-enumerable symbol tag (`ENUM_TAG`,
 * described for debugging as `__thetaEnum`) installed on a boxed `String`:
 * `JSON.stringify` of a boxed string yields the bare wire string, and the
 * symbol tag is excluded from JSON output regardless of enumerability, so the
 * value serialises to the bare wire string while still carrying its
 * declaring-enum tag for cross-enum equality. The concrete shape is an
 * implementation detail not reachable from Theta code.
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
 * install it. `tag` is always one of the three module-private symbols.
 *
 * The rationale for that posture — cross-referenced from the three tag
 * declarations rather than restated at each — has three independent parts:
 *
 *   1. The **symbol key alone** hides the brand. A symbol-keyed property is
 *      absent from every string-keyed surface: `JSON.stringify` output,
 *      `Object.keys` / `Object.entries`, `for…in`, the {@link valuesEqual}
 *      key walk, and membership tests taking a string argument. Its
 *      enumerability bears on none of them. The same key space forecloses
 *      forgery and collision: JSON parsing and theta-side object
 *      construction produce string keys only, so no wire payload and no
 *      theta ctor can construct a key `===` to a module symbol (the
 *      enumerable-key forgery class of bugs 0017 and 0020), and no declared
 *      field can occupy a brand's key (bug 0026).
 *   2. The **non-enumerable install** bounds propagation, the one surface
 *      the symbol key does not cover: object spread and `Object.assign` copy
 *      own *enumerable* symbol-keyed properties. A non-enumerable brand
 *      stays behind, so a copy that no constructor produced does not carry
 *      the classification of the value it was copied from.
 *   3. The **read-side enumerability test** consults exactly one descriptor
 *      bit and rejects exactly one posture: an *enumerable* brand. That is
 *      the departure worth rejecting — enumerable is what ordinary property
 *      creation produces (plain assignment `value[tag] = …`, and every key
 *      `JSON.parse` mints on the string-keyed side), and per part 2 it is
 *      the one posture that propagates through spread / `Object.assign`, so
 *      a brand installed enumerably reads back `undefined` here rather than
 *      classifying. `writable` and `configurable` are not consulted: a
 *      non-enumerable data property holding the brand value classifies
 *      whatever those two bits say.
 *
 * Arrays never carry a brand; the boxed-`String` enum carrier is an object
 * and passes the guard.
 */
function privateBrandOf(value: ThetaValue, tag: symbol): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, tag);
  return descriptor !== undefined && !descriptor.enumerable ? descriptor.value : undefined;
}

/**
 * Whether `value` is an *object value* in the language's sense of
 * runtime-value-model.md's object row — the receiver kind the `object` stdlib
 * surface (`keys()` / `values()` / `has(k)`) and indexed / member access are
 * defined over (bug 0027 §Fix). `false` for an enum value and a `Result`
 * value: both satisfy JS `typeof "object"` (an enum value is a boxed
 * `String`; a `Result` is an `{ ok, … }` literal) but runtime-value-model.md's
 * enum and `Result` rows admit no field / index / membership surface on
 * either, so neither is an object value in the language's sense. `true` for
 * every other value, including an array, a plain object-schema value, and a
 * non-`typeof "object"` primitive ({@link isEnumValue} and
 * {@link isResultValue} both answer `false` on a primitive too, since
 * {@link privateBrandOf} itself excludes it before either can classify).
 * This classifier answers exactly one question — object-value-or-not among
 * `typeof "object"` inputs — and leaves every other exclusion (`null`, an
 * array, a primitive) to its caller, each of which already applies the
 * exclusion it needs before consulting this function.
 *
 * The single classification point the four runtime read entry points route
 * through ahead of the object path, so a classification change has one
 * definition site rather than four: `applyStdlibMethod`
 * (statement-executor.ts) and `evaluateStdlibMethod`
 * (production-theta-producer.ts) ahead of their `evaluateObjectMember` call;
 * the widened non-object guard in `evaluateIndexAccess` and the enum/`Result`
 * guard in `evaluateMemberAccess` (both runtime-panics.ts).
 */
export function isObjectValue(value: ThetaValue): boolean {
  return !isEnumValue(value) && !isResultValue(value);
}

/**
 * The declaring-enum tag of `value` if it is an enum value, else `undefined`.
 * The brand is the **non-enumerable** descriptor {@link makeEnumValue}
 * installs on the module-private `ENUM_TAG` symbol, never a same-described
 * string key: JSON parsing and theta-side object construction produce only
 * string keys, so an object carrying an enumerable `__thetaEnum` STRING key
 * (e.g. `{ __thetaEnum: "Severity" }`) occupies an entirely different key
 * from the brand and is ordinary user/model data — it takes the object arm of
 * `==` and the object rule of the QRY-18 render like any other plain object
 * (runtime-value-model.md, enum row: the tag is interpreter-private; bug
 * 0020).
 */
function enumTagOf(value: ThetaValue): string | undefined {
  const brand = privateBrandOf(value, ENUM_TAG);
  return typeof brand === "string" ? brand : undefined;
}

/**
 * The interpreter-private symbol recording the declaring `schema` of an
 * object-schema value. A symbol key occupies no string name at all, so a
 * schema field declared with the same description — a field literally named
 * `__thetaSchema` — is an ordinary string-keyed property the ctor's field
 * assignment and this brand install can coexist on; neither can overwrite the
 * other because they target disjoint key spaces (bug 0026). That disjointness
 * is also what makes the tag invisible to every theta-visible object surface
 * — `JSON.stringify`, `Object.keys` / `.entries` (`obj.keys()`), and the
 * {@link valuesEqual} structural relation all walk string keys, so the tag
 * never appears in JSON output, never appears in a `keys()` result, and never
 * affects equality (runtime-value-model.md: an object schema is a "JS plain
 * object keyed by theta-side names"). {@link brandSchemaValue} installs it
 * **non-enumerable**, the posture {@link privateBrandOf} states. Two
 * consumers recover it: the QRY-18 interpolation render path, which needs
 * the declaring schema to apply outbound wire-name translation recursively,
 * and the `QuestionOperandDefectError` operand summariser
 * (`runtime-panics.ts`), which names the schema in its diagnostic text.
 * The `"__thetaSchema"` description is debug-only, carries no semantics, and
 * exists only so the brand reads legibly under a debugger and greps against
 * the bug docs.
 */
const SCHEMA_TAG = Symbol("__thetaSchema");

/**
 * Brand a freshly-constructed object-schema value with its declaring `schema`
 * name, so a later consumer can recover the schema to apply outbound
 * wire-name translation (QRY-18). The tag is installed **non-enumerable** on
 * the module-private `SCHEMA_TAG` symbol, a key no declared field can ever
 * occupy — even a field literally named `__thetaSchema` is an ordinary
 * string-keyed property that this install neither reads nor touches (bug
 * 0026). Branding is therefore purely additive: the branded value is
 * indistinguishable from a plain object on every theta-visible surface, and
 * no declared field's value or descriptor is ever at risk from the install.
 * Only {@link schemaTagOf} reads it. Returns the same object for chaining.
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
 * Only the **non-enumerable** descriptor {@link brandSchemaValue} installs on
 * the module-private `SCHEMA_TAG` symbol classifies — a string key spelled
 * `__thetaSchema`, enumerable or not, occupies a different key from the
 * symbol and is always ordinary user/model data, so a wire payload or theta
 * ctor field naming `__thetaSchema` cannot select, by name, which declared
 * schema's theta→wire renames the QRY-18 outbound render applies to its
 * carrying object (bug 0020).
 */
export function schemaTagOf(value: ThetaValue): string | undefined {
  const brand = privateBrandOf(value, SCHEMA_TAG);
  return typeof brand === "string" ? brand : undefined;
}

/**
 * Structural view of a declaring `schema`'s object-form field list — the
 * shape {@link buildObjectSchemaValue} needs from a resolved schema
 * declaration. Declared structurally rather than by importing `SchemaDecl`
 * from `../parser/theta-document`, so this leaf module stays import-free
 * (bug 0079 landed a reviewed two-node runtime cycle between
 * `type-layer-checks.ts` and `theta-document.ts`; this module does not add a
 * second one). `LexicalEnvironment.resolveSchema`'s return type, `SchemaDecl
 * | undefined`, is structurally assignable here: its `fields?: readonly
 * SchemaFieldSource[]` and `SchemaFieldSource.name: string` satisfy the shape
 * below without either module referencing the other.
 */
export interface SchemaFieldOrder {
  readonly fields?: readonly { readonly name: string }[];
}

/**
 * Build the runtime value for an object/schema-constructor expression
 * (expressions.md §"Object construction"), reordering the already-evaluated
 * field record into the declaring schema's DECLARATION order before branding
 * (bug 0080 §Fix, "Order at construction"). The one construction point both
 * constructor evaluation sites call — `evalExpr`'s `case "object"` arm in
 * statement-executor.ts and `evaluatePureExpression`'s `case "object"` in
 * production-theta-producer.ts — so the two sites cannot drift on the
 * ordering rule (the lockstep obligation bug 0027 records for its four read
 * entry points). The returned record's own-key order IS declaration order:
 * theta field names are identifiers (`[A-Za-z_][A-Za-z0-9_]*`), never
 * integer-like, so JS orders them by insertion. `evaluateObjectMember`'s
 * `keys()`/`values()` (stdlib-object.ts) and a bare `JSON.stringify` see
 * that unconditionally; the QRY-18 walk (`translateInterpolationOutbound`,
 * production-theta-producer.ts) does not — it reads in order but writes
 * a FRESH record keyed by WIRE names, where an `as`-renamed array-index
 * key fronts (the exception query-escapes-stringification.md states).
 *
 * `constructedFields` is the field record already built, keyed by
 * theta-side field name, in the constructor's OWN source order — each
 * field's value is already evaluated; only the resulting record's key order
 * is decided here. `typeName` is the constructor's schema name, or `null`
 * for a bare `{ … }` object literal. `resolveSchema` looks up a declared
 * schema's field list structurally (`env.resolveSchema`), so this module
 * never imports `SchemaDecl`.
 *
 * Four cases, on what `typeName` names and what it resolves to:
 *
 *   - `typeName === null` (a bare object literal names no schema): returns
 *     `constructedFields` unchanged and unbranded. Anonymous objects keep
 *     INSERTION order — an explicit non-goal (expressions.md: "insertion
 *     order otherwise").
 *   - `resolveSchema(typeName)` answers `undefined` (an unresolved
 *     constructor name): returns `constructedFields` unchanged and
 *     unbranded — bug 0025's unresolved-schema-name passthrough, preserved
 *     byte-for-byte.
 *   - the resolved decl's `fields` is `undefined` (the alias / `by … = …` /
 *     head-only three-way shape bug 0033 landed): no declared field list
 *     exists to order by, so `constructedFields` is branded AS-IS, in its
 *     existing order.
 *   - the resolved decl declares `fields`: builds a FRESH record — every
 *     declared field name PRESENT in `constructedFields`, in DECLARED
 *     order, then every remaining constructed key in its existing relative
 *     order (the defensive fallback for a name the schema does not
 *     declare; already rejected at parse as
 *     `theta/parse/extra-object-field`, so this branch is unreached in
 *     practice) — then brands the fresh record.
 *
 * Every read of `constructedFields` by an author-written field name is
 * OWN-KEY-guarded (`Object.prototype.hasOwnProperty.call`), never
 * truthiness: a declared field name the constructor did not supply (e.g. a
 * schema declaring `toString` whose constructor omits it) must not be
 * filled in from `Object.prototype`. The returned record's key SET and key
 * COUNT are therefore always identical to `constructedFields`'s — no
 * declared name is invented and no constructed key is dropped or
 * duplicated (bug 0026's `__thetaSchema`-named-field case: the brand
 * install still targets a value whose STRING keys are exactly the declared
 * theta-side names). Callers build `constructedFields` with
 * {@link defineRecordField} rather than by assignment, so a declared field
 * named `__proto__` IS an own key of that record: the own-key guard below
 * classifies it exactly like any other declared name. The rebuild defines
 * each surviving field the same way, so the inherited `__proto__` accessor
 * cannot re-drop it here (bug 0119).
 */
export function buildObjectSchemaValue(
  constructedFields: Record<string, ThetaValue>,
  typeName: string | null,
  resolveSchema: (name: string) => SchemaFieldOrder | undefined,
): { readonly [key: string]: ThetaValue } {
  if (typeName === null) {
    return constructedFields;
  }
  const decl = resolveSchema(typeName);
  if (decl === undefined) {
    return constructedFields;
  }
  if (decl.fields === undefined) {
    return brandSchemaValue(constructedFields, typeName);
  }
  const ordered: Record<string, ThetaValue> = {};
  for (const field of decl.fields) {
    if (Object.prototype.hasOwnProperty.call(constructedFields, field.name)) {
      defineRecordField(ordered, field.name, constructedFields[field.name] as ThetaValue);
    }
  }
  for (const key of Object.keys(constructedFields)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      defineRecordField(ordered, key, constructedFields[key] as ThetaValue);
    }
  }
  return brandSchemaValue(ordered, typeName);
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
 * as `brandResult` installs it: a **non-enumerable** own property keyed by
 * the module-private `RESULT_TAG` symbol. A same-described string key is
 * never sufficient, on two independent grounds: JSON parsing and theta-side
 * construction produce only string keys, never a key `===` to the symbol,
 * and even a hypothetical string key spelled `__thetaResult` would be
 * ordinary user/model data regardless of its own enumerability — accepting
 * it would let a wire payload `{"__thetaResult": true, "ok": false, …}` forge
 * an `Err`. Declared object schemas lower closed (`additionalProperties:
 * false`, body-type-lowering.ts) and reject such a payload, but it still
 * enters through permissive `{}` lowerings (forward/self/unresolved refs,
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
 * Install the interpreter-private `Result` brand on the module-private
 * `RESULT_TAG` symbol. The symbol key is what makes the brand invisible on
 * every theta-visible surface and in JSON output: a symbol key is excluded
 * from `JSON.stringify` and `structuredClone` regardless of enumerability,
 * so a clone that round-trips through either drops it, and a boundary that
 * legitimately round-trips a `Result`'s arms must re-enter through `makeOk`
 * / `makeErr` at decode. The same key space forecloses forgery outright —
 * string keys are all JSON and theta ctors can produce, and no string key is
 * `===` to `RESULT_TAG`, so a same-described string key is ordinary
 * user/model data that {@link isResultValue} does not classify. The install
 * is **non-enumerable**, the posture {@link privateBrandOf} states.
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

/**
 * Define `name` as an own enumerable data property of `record`, instead of
 * assigning it. Every field name on the record-building path is
 * author-controlled (a declared schema field, a Pi-tool argument name, a
 * declared wire name), and `__proto__` is not an ordinary string key on a
 * plain object — it is an accessor `record` inherits from `Object.prototype` —
 * so a plain assignment either no-ops (a non-object value) or replaces
 * `record`'s prototype (an object value) instead of creating an own property.
 * This is the 0031/0038 null-prototype-or-own-key-guard hazard class, applied
 * at the runtime record-building sites rather than at the type layer.
 * `defineProperty` is preferred over a null-prototype record so
 * `Object.prototype` and every own-key-only read surface stay unperturbed: the
 * descriptor below is byte-identical to what an assignment produces, so no
 * consumer of the record observes a difference.
 */
export function defineRecordField<T>(record: Record<string, T>, name: string, value: T): void {
  Object.defineProperty(record, name, { value, enumerable: true, writable: true, configurable: true });
}
