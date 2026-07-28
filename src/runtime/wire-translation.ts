// V2e / V2e-T — the wire-name translation boundary seam.
//
// This module owns the inbound/outbound wire-name translation pass of
// runtime-value-model.md §"Wire-name translation" (the RVM code-keyed
// obligation area — no numbered REQ-IDs). Wire-name translation happens in
// exactly two places:
//
//   - *Inbound* (model output → theta value): after AJV validation against the
//     lowered schema, the runtime walks the validated JSON and (a) rebuilds the
//     value with theta-side names using each schema's translation map (the
//     `V5f`-produced wire-name sidecar), and (b) at every position the lowering
//     pass's *Named-enum positions* sidecar maps to a declaring-enum name,
//     reattaches that enum's tag (via the `V2c` `makeEnumValue` representation)
//     so the resulting value compares equal to a locally constructed variant of
//     the same enum. Anonymous string-literal-union positions are absent from
//     the sidecar and receive no tag — equality on those falls back to plain
//     string equality (`Severity.Low == "low"` remains `false`). The walk
//     recurses through arrays and nested object fields (`Result` has no
//     lowered-schema form, so an inbound value never contains one). Theta
//     code never sees wire names.
//   - *Outbound* (theta value → JSON): the runtime walks the theta-side value and
//     produces wire-named JSON before AJV validation.
//
//   Frontmatter `params:` defaults **bypass** the inbound translation pass:
//   defaults are parsed as ordinary Theta values at frontmatter-parse time and
//   arrive at the theta body already branded and theta-side-named, so a default
//   authored as `Severity.High` is indistinguishable from a body-code
//   `Severity.High` — neither passes through `translateInbound`.
//
// V2e (implementation) fills the behaviour-bearing functions, consuming the
// `V5f` per-schema sidecar.
//
// **Nested `$ref` resolution (divergence — see notes.md / decisions.jsonl).**
// The `V5f` `SchemaSidecar` carries a wire-name map and a named-enum-position
// map but *no per-field `$ref` target*. The spec lowers a reference to a named
// schema to `$ref` against `$defs`, but the seam handed to this boundary records
// no edge from a field to the `$defs` it references. The only signal available
// to recurse into a nested schema is therefore name matching: when a field's
// wire name matches a `$defs` key in the per-`$defs` sidecar map, the walk
// recurses with that nested sidecar. This is faithful for the fixtures (where a
// nested-object field's wire name equals its target `$defs` name) but cannot be
// faithful in general (a field `manager: Person` references `$defs` `Person`,
// not `$defs` `manager`); a fully faithful boundary needs the `V5f` lowering
// pass to emit a per-field ref-target into the sidecar, which is out of this
// leaf's scope.

import { type SchemaSidecar } from "../parser/schema-lowering";
import { makeEnumValue, type ThetaValue } from "./value";

/**
 * The wire-name property segment of a top-level named-enum-position pointer.
 * The sidecar's pointers index the *lowered fragment* (a JSON Schema), so a
 * field position reads `/properties/<wireName>`; the schema-space `/properties/`
 * keyword maps to the data-space field. Returns the wire-name segment for a
 * top-level `/properties/<name>` pointer, else `undefined` (nested positions
 * belong to the referenced `$defs`'s own sidecar, never this one's).
 */
function topLevelEnumProperty(pointer: string): string | undefined {
  const segments = pointer.split("/");
  // segments[0] is the empty string before the leading slash.
  if (segments.length === 3 && segments[1] === "properties") {
    return decodePointerSegment(segments[2] ?? "");
  }
  return undefined;
}

/** Decode an RFC 6901 JSON Pointer segment (`~1`→`/`, `~0`→`~`). */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Whether `value` is a plain (non-array, non-enum-boxed, non-null) JS object. */
function isPlainObject(value: unknown): value is { readonly [k: string]: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof String)
  );
}

/**
 * Inbound translation input. The runtime supplies the AJV-validated, wire-named
 * JSON together with the `V5f`-produced per-`$defs` sidecars (keyed by `$defs`
 * name so the walk can recurse through `$ref`) and the `$defs` name of the
 * schema the validated value conforms to.
 */
export interface InboundTranslationInput {
  /** AJV-validated, wire-named JSON (model output / typed decode source). */
  readonly validated: unknown;
  /** Per-`$defs` sidecars keyed by `$defs` name, for recursion through `$ref`. */
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  /** The `$defs` name of the schema `validated` conforms to. */
  readonly rootDef: string;
}

/**
 * Outbound translation input: a theta-side value plus the per-`$defs` sidecars
 * and the root `$defs` name, mirroring {@link InboundTranslationInput}.
 */
export interface OutboundTranslationInput {
  /** The theta-side value to lower to wire-named JSON. */
  readonly value: ThetaValue;
  /** Per-`$defs` sidecars keyed by `$defs` name, for recursion through `$ref`. */
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  /** The `$defs` name of the schema `value` conforms to. */
  readonly rootDef: string;
}

/**
 * Inbound wire-name translation (model output → theta value). Walks the
 * AJV-validated JSON, rebuilds theta-side names using the sidecar's wire-name
 * translation map, and reattaches each named-enum position's declaring-enum tag
 * so the result compares equal to a locally constructed variant. The walk
 * recurses through arrays and nested object fields; theta code never sees a wire
 * name at any depth.
 */
export function translateInbound(input: InboundTranslationInput): ThetaValue {
  return rebuildInbound(input.validated, input.sidecars.get(input.rootDef), input.sidecars);
}

/**
 * Recursively rebuild one inbound value to its theta-side form under `sidecar`
 * (the sidecar of the `$defs` this value conforms to, or `undefined` when the
 * referenced `$defs` could not be resolved — see the nested-`$ref` divergence
 * note above). Renames object keys wire→theta, reattaches the declaring-enum tag
 * at each named-enum position, and recurses through arrays and nested objects.
 */
function rebuildInbound(
  value: unknown,
  sidecar: SchemaSidecar | undefined,
  sidecars: ReadonlyMap<string, SchemaSidecar>,
): ThetaValue {
  if (Array.isArray(value)) {
    // Array elements carry their own `$defs`; without a per-element ref target
    // the elements recurse with no sidecar (rename/enum-tag at element level is
    // unresolvable through this seam — see the divergence note above).
    return value.map((element) => rebuildInbound(element, undefined, sidecars));
  }
  if (!isPlainObject(value)) {
    return value as ThetaValue;
  }

  const wireToTheta = new Map<string, string>();
  const enumByWireKey = new Map<string, string>();
  if (sidecar !== undefined) {
    for (const entry of sidecar.wireNames) {
      wireToTheta.set(entry.wire, entry.theta);
    }
    for (const position of sidecar.namedEnumPositions) {
      const wireKey = topLevelEnumProperty(position.pointer);
      if (wireKey !== undefined) {
        enumByWireKey.set(wireKey, position.enumName);
      }
    }
  }

  const result: { [k: string]: ThetaValue } = {};
  for (const [wireKey, fieldValue] of Object.entries(value)) {
    const thetaKey = wireToTheta.get(wireKey) ?? wireKey;
    const enumName = enumByWireKey.get(wireKey);
    if (enumName !== undefined && typeof fieldValue === "string") {
      // Named-enum position: reattach the declaring-enum tag so the rebuilt
      // value compares equal to a locally constructed variant. Anonymous
      // string-literal-union positions are absent from `enumByWireKey` and so
      // stay plain strings.
      result[thetaKey] = makeEnumValue(enumName, fieldValue);
    } else {
      // Recurse: a nested object/array is rebuilt under the referenced `$defs`'s
      // sidecar, resolved by wire-name↔`$defs`-name match (divergence note).
      result[thetaKey] = rebuildInbound(fieldValue, sidecars.get(wireKey), sidecars);
    }
  }
  return result;
}

/**
 * Outbound wire-name translation (theta value → JSON). Walks the theta-side value
 * and produces wire-named JSON before AJV validation: object keys are rewritten
 * theta→wire, enum values collapse to their bare wire string, and the walk
 * recurses through arrays and nested objects.
 */
export function translateOutbound(input: OutboundTranslationInput): unknown {
  return lowerOutbound(input.value, input.sidecars.get(input.rootDef), input.sidecars);
}

/**
 * Recursively lower one theta-side value to its wire-named JSON form under
 * `sidecar`. Renames object keys theta→wire, collapses an enum value to its bare
 * wire string (the declaring-enum tag never appears in JSON output), and
 * recurses through arrays and nested objects.
 */
function lowerOutbound(
  value: ThetaValue,
  sidecar: SchemaSidecar | undefined,
  sidecars: ReadonlyMap<string, SchemaSidecar>,
): unknown {
  if (value instanceof String) {
    // An enum value is a boxed string carrying a non-enumerable declaring-enum
    // tag; its wire form is the bare string (the tag never crosses the wire).
    return value.valueOf();
  }
  if (Array.isArray(value)) {
    return value.map((element) => lowerOutbound(element, undefined, sidecars));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const thetaToWire = new Map<string, string>();
  if (sidecar !== undefined) {
    for (const entry of sidecar.wireNames) {
      thetaToWire.set(entry.theta, entry.wire);
    }
  }

  const result: { [k: string]: unknown } = {};
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const wireKey = thetaToWire.get(thetaKey) ?? thetaKey;
    result[wireKey] = lowerOutbound(fieldValue as ThetaValue, sidecars.get(wireKey), sidecars);
  }
  return result;
}
