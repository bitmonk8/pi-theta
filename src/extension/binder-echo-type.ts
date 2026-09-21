// Value-driven binder argument-echo types in declaration order.

import { type ThetaValue } from "../runtime/value";
import { type EchoType } from "../render/argument-echo";

/**
 * Derive the argument-echo `EchoType` for a bound value, VALUE-driven so it can
 * never mismatch the value's runtime shape and crash the renderer. The lowered
 * params property (when available) disambiguates `integer` from `number`; every
 * other arm is decided from the runtime value. This function reads the
 * AJV-validated MERGED `args` (`#emitBinderEchoNote`'s `mergedArgs`), which are
 * wire form throughout, so a named-enum value arrives here as the bare JSON
 * string AJV admitted — never as the runtime's boxed `String` carrier
 * (`makeEnumValue`, `runtime/value.ts`) — and the `string` arm is the one it
 * takes. Each array element is described by itself, not by element 0's shape, so
 * a heterogeneous array (an `anyOf` items schema) never misdescribes an element
 * it did not derive from. Object fields are ordered by the lowered `properties`
 * record's own key order — declaration order, per
 * `defaulting-system-note-echo.md:43` — when one is available for the
 * position (schema-typed and inline-object fields, and a discriminated
 * union's matching `anyOf` arm); `Object.entries(value)` value order is the
 * fallback only for the descriptor-less recursion arms
 * (docs/bugs/0381-echo-object-first-field-model-key-order.md §Fix).
 */
function echoTypeFromValue(
  value: ThetaValue,
  property: unknown,
  defs: Readonly<Record<string, unknown>>,
): EchoType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: loweredSchemaKindIsInteger(property, value) ? "integer" : "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (Array.isArray(value)) {
    // Dereference the property before reading `items`: an alias-named array
    // param (`schema Tags = array<Tag>; xs: Tags`) lowers the position to a
    // `{"$ref":"#/$defs/Tags"}` node whose `items` is only reachable behind
    // the deref — reading `items` off the raw `$ref` yields `undefined` and
    // object elements fall back to the model's key order, 0381's symptom
    // recursing into an array element
    // (docs/bugs/0381-echo-object-first-field-model-key-order.md §Fix;
    // defaulting-system-note-echo.md:43 "an array element").
    const resolvedArrayProp = derefLoweredProperty(property, defs, 0);
    const itemProp =
      typeof resolvedArrayProp === "object" && resolvedArrayProp !== null
        ? (resolvedArrayProp as Record<string, unknown>)["items"]
        : undefined;
    // Every element is described by ITSELF (the same discipline the object arm
    // below already applies to its fields), so an `anyOf` items schema —
    // `array<T | null>` or an array of discriminated-union variants — yields
    // one descriptor per variant instead of element 0's shape misdescribing
    // the rest (docs/bugs/0092-renderobject-first-field-unguarded-cast.md).
    const elements = value.map((el) => echoTypeFromValue(el as ThetaValue, itemProp, defs));
    return { kind: "array", elements };
  }
  // A plain object value: render fields in the lowered `properties` record's
  // key order (declaration order) when one is available for this position;
  // fall back to the value's own key insertion order only when the position
  // carries no `properties` record at all (docs/bugs/0381 §Fix). Every
  // object/union position lowers to a `$ref` into `defs`
  // (schema-lowering.ts), so `property` is dereferenced before either check.
  const valueRecord = value as Record<string, ThetaValue>;
  const props = loweredObjectPropertiesFor(property, valueRecord, defs);
  const fields =
    props !== undefined
      ? declarationOrderedEchoFields(valueRecord, props, defs)
      : Object.entries(valueRecord).map(([name, fieldValue]) => ({
          name,
          type: echoTypeFromValue(fieldValue, undefined, defs),
        }));
  return { kind: "object", fields };
}

/**
 * The ref-chase bound (`REF_CHASE_LIMIT`-equivalent): a recursive named schema's
 * `$defs` entry can ref back into its own closure, and dereferencing a `$ref`
 * consumes no VALUE, so only a bound guarantees termination on a pathological
 * chain. No lowered schema this codebase emits nests anywhere near this deep.
 */
const ECHO_REF_CHASE_LIMIT = 16;

/**
 * Follow a lowered schema position's `{"$ref": "#/$defs/<name>"}` chain into
 * `defs` to the fragment it names — every schema-typed, inline-object, and
 * discriminated-union position lowers to exactly this ref form
 * (schema-lowering.ts: "the only `$ref` form lowering emits"), so the
 * declaration-ordered `properties`/`anyOf` the echo needs sits one (or more,
 * for a type-alias chain) hop behind it. A non-`$ref` node, an unresolvable
 * name, or a chain past the bound returns the position unchanged.
 */
function derefLoweredProperty(
  property: unknown,
  defs: Readonly<Record<string, unknown>>,
  depth: number,
): unknown {
  if (typeof property !== "object" || property === null || depth >= ECHO_REF_CHASE_LIMIT) {
    return property;
  }
  const ref = (property as Record<string, unknown>)["$ref"];
  if (typeof ref !== "string") {
    return property;
  }
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  const name = match?.[1];
  if (name === undefined) {
    return property;
  }
  // Own-key guarded: an author-uncontrolled `$ref` name (`constructor`,
  // `toString`) must not read an inherited `Object.prototype` member
  // (__proto__ discipline, mirroring the `mergedArgs` own-key guard in
  // `#emitBinderEchoNote`).
  const target = Object.prototype.hasOwnProperty.call(defs, name) ? defs[name] : undefined;
  return target === undefined ? property : derefLoweredProperty(target, defs, depth + 1);
}

/**
 * The declaration-ordered `properties` record governing an object position, or
 * `undefined` when none is available (the descriptor-less recursion arms,
 * which fall back to value key order). A schema-typed or inline-object field's
 * lowered (and dereferenced) property carries `properties` directly; a
 * discriminated union's carries `anyOf` instead, and the variant matching
 * `value` supplies its own `properties` (docs/bugs/0381 §Fix, §"the lowered
 * `anyOf` branch matching the value").
 */
function loweredObjectPropertiesFor(
  property: unknown,
  value: Record<string, ThetaValue>,
  defs: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const resolved = derefLoweredProperty(property, defs, 0);
  if (typeof resolved !== "object" || resolved === null) {
    return undefined;
  }
  const resolvedRecord = resolved as Record<string, unknown>;
  const directProps = resolvedRecord["properties"];
  if (typeof directProps === "object" && directProps !== null) {
    return directProps as Record<string, unknown>;
  }
  const arms = resolvedRecord["anyOf"];
  return Array.isArray(arms) ? firstAdmittingArmProperties(value, arms, defs) : undefined;
}

/**
 * The FIRST `anyOf` arm (source order) whose `properties` the value admits,
 * consistent with the existing law of re-testing a value against each arm in
 * source order and taking the first admitting one
 * (`#validateInvokeReturn`'s anyOf clause; runtime-value-model.md §"Wire-name
 * translation"). This echo-derivation site has no `SchemaValidator` in scope
 * (it is a pure value→descriptor function, not a validation boundary), so
 * admission is decided from two `schema-subset.md:8/:12` invariants — every
 * arm's `required` lists ALL its declared properties and
 * `additionalProperties` is always `false`: an arm is taken when the value's
 * own-key set equals the arm's `properties` key set AND every `const`-valued
 * property in the arm equals the value's same-named field (the discriminator
 * check). Each arm is itself a `$ref` (lowerUnion emits arms as `$ref`s into
 * `defs`) and is dereferenced before its `properties` is read. Returns
 * `undefined` when no arm matches, so the caller falls back to value key
 * order rather than guessing.
 *
 * SCOPE of the match: this key-set + `const` test picks the AJV-matching arm
 * exactly for a DISCRIMINATED (all-object) union — where schemas.md
 * guarantees each variant a unique single-literal discriminator — and for a
 * union carrying at most one object arm. For an UNDISCRIMINATED
 * multi-object-arm union (reachable only via a mixed union `A | B | string`
 * or an inline object union, which schemas.md does not discriminator-gate)
 * two arms may share a key set with no distinguishing `const`; the first
 * key-set match is then a DETERMINISTIC but possibly non-AJV-matching arm.
 * Recorded limitation (docs/bugs/0381 §Fix residual): the faithful fix
 * re-tests each arm through the `SchemaValidator`, as
 * runtime-value-model.md §"Wire-name translation" does.
 */
function firstAdmittingArmProperties(
  value: Record<string, ThetaValue>,
  arms: readonly unknown[],
  defs: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const valueKeySet = new Set(Object.keys(value));
  for (const rawArm of arms) {
    const arm = derefLoweredProperty(rawArm, defs, 0);
    if (typeof arm !== "object" || arm === null) {
      continue;
    }
    const armProps = (arm as Record<string, unknown>)["properties"];
    if (typeof armProps !== "object" || armProps === null) {
      continue;
    }
    const armPropsRecord = armProps as Record<string, unknown>;
    const armKeys = Object.keys(armPropsRecord);
    if (armKeys.length !== valueKeySet.size || !armKeys.every((key) => valueKeySet.has(key))) {
      continue;
    }
    const everyConstMatches = armKeys.every((key) => {
      const fieldSchema = armPropsRecord[key];
      if (typeof fieldSchema !== "object" || fieldSchema === null) {
        return true;
      }
      const constValue = (fieldSchema as Record<string, unknown>)["const"];
      return constValue === undefined || value[key] === constValue;
    });
    if (everyConstMatches) {
      return armPropsRecord;
    }
  }
  return undefined;
}

/**
 * Build `EchoField`s for `value` in `props`' key order (declaration order),
 * then append any of the value's own keys `props` does not declare, in the
 * value's own insertion order. The append arm is defensive: `required` lists
 * every declared property and `additionalProperties` is always `false`
 * (schema-subset.md:8/:12), so a correctly-paired value/`props` never reaches
 * it — but a malformed pairing must still render every value field rather
 * than silently drop data.
 *
 * `props`' key order carries declaration order only for identifier-shaped
 * wire names; a non-identifier wire name JS canonicalises — a numeric-string
 * wire name such as `as "0"` — is reordered ahead of declaration order by
 * the JS engine's own-key ordering. Recorded limitation (docs/bugs/0381 §Fix
 * residual): the declaration-order carrier immune to this is the step-5
 * `fieldOrder` sidecar (schema-subset.md map 4), not the `properties` key
 * order this consults.
 */
function declarationOrderedEchoFields(
  value: Record<string, ThetaValue>,
  props: Record<string, unknown>,
  defs: Readonly<Record<string, unknown>>,
): Array<{ readonly name: string; readonly type: EchoType }> {
  const declared = Object.keys(props)
    .filter((name) => Object.prototype.hasOwnProperty.call(value, name))
    .map((name) => ({
      name,
      type: echoTypeFromValue(value[name] as ThetaValue, props[name], defs),
    }));
  const extra = Object.entries(value)
    .filter(([name]) => !Object.prototype.hasOwnProperty.call(props, name))
    .map(([name, fieldValue]) => ({ name, type: echoTypeFromValue(fieldValue, undefined, defs) }));
  return [...declared, ...extra];
}

/**
 * Whether the lowered params property declares `integer` (BNDR-4 renders
 * `integer` vs `number` from the static kind, never runtime integrality). Falls
 * back to the runtime value's integrality when the property is unavailable.
 */
function loweredSchemaKindIsInteger(property: unknown, value: number): boolean {
  if (typeof property === "object" && property !== null) {
    const type = (property as Record<string, unknown>)["type"];
    if (type === "integer") {
      return true;
    }
    if (type === "number") {
      return false;
    }
    if (Array.isArray(type)) {
      if (type.includes("integer") && !type.includes("number")) {
        return true;
      }
      if (type.includes("number")) {
        return false;
      }
    }
  }
  return Number.isInteger(value);
}

export { echoTypeFromValue };
