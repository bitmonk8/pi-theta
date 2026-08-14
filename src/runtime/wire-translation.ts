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
//     recurses through arrays, nested object fields and `$ref` targets, and
//     passes a `Result` value through unchanged: `Result` is not a lowerable
//     type form (schema-subset.md §"Lowering Algorithm" step 3), so no
//     `Result` can arrive from validated JSON; the only one reaching this seam
//     is an in-process `invoke` callee's own value, already theta-side and
//     already tagged. Theta code never sees wire names.
//   - *Outbound* (theta value → JSON): the runtime walks the theta-side value and
//     produces wire-named JSON before AJV validation.
//
//   Frontmatter `params:` defaults **bypass** the inbound translation pass:
//   defaults are parsed as ordinary Theta values at frontmatter-parse time and
//   arrive at the theta body already branded and theta-side-named, so a default
//   authored as `Severity.High` is indistinguishable from a body-code
//   `Severity.High` — neither passes through `translateInbound`.
//
// **The positions this pass reaches.** The sidecar is keyed by JSON Pointer
// into the lowered schema fragment, so the pass applies exactly where a pointer
// addresses a value: the annotated root, a named-enum position, a `$ref`
// target's own fragment, and an array element one `/items` segment deeper. A
// `{"anyOf":[…]}` arm carries no such position — `anyOf` has no image in the
// data space the way `properties` and `items` do, so nothing in the lowered
// fragment names which arm governs a materialised value. A value sitting inside
// a union arm is therefore left exactly as AJV validated it: no rename, no
// enum tag, no brand, and no descent beneath it.
//
// V2e (implementation) fills the behaviour-bearing functions, consuming the
// `V5f` per-schema sidecar.
//
// **Nested `$ref` resolution.** The `V5f` `SchemaSidecar` carries a per-position
// `$ref`-target map, so the walk recurses into the `$defs` entry a position
// actually references — a field `manager: Person` resolves `$defs` `Person`,
// not `$defs` `manager`, and an `array<Person>` element resolves `Person` at
// the element position. A sidecar carrying NO `refTargets` map at all (the
// field is optional) falls back to matching a field's wire name against a
// `$defs` key, faithful only where the two happen to agree; `buildSidecar`
// always emits the map, so that fallback serves a sidecar that omits the map,
// never a production caller.

import { type SchemaSidecar } from "../parser/schema-lowering";
import {
  brandSchemaValue,
  isResultValue,
  makeEnumValue,
  type ThetaValue,
} from "./value";

/** Encode an RFC 6901 JSON Pointer segment (`~`→`~0`, `/`→`~1`). */
function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
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
  /**
   * The `$defs` names that are declared theta-side `schema` names. A rebuilt
   * object whose `$defs` entry is in this set is branded with that name, so it
   * is recoverable through `schemaTagOf` exactly as a constructor-built value
   * is. Absent (the default) brands nothing: a caller that cannot say which
   * names are declared must not invent a brand, and neither the reserved root
   * key nor a minted `__inline_<slug>` entry names a declaration.
   */
  readonly schemaNames?: ReadonlySet<string>;
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
 * translation map, reattaches each named-enum position's declaring-enum tag,
 * and — where `schemaNames` names the position's `$defs` entry — brands a
 * rebuilt object with its declaring schema. The walk recurses through arrays
 * and nested object fields and through a `$ref` position's own `$defs` entry;
 * theta code never sees a wire name at any depth.
 *
 * Its reach is the set of positions the sidecar's JSON Pointers address — the
 * annotated root, named-enum positions, `$ref` targets, and array elements. A
 * `{"anyOf":[…]}` arm is not such a position, so a value inside one is returned
 * exactly as AJV validated it.
 */
export function translateInbound(input: InboundTranslationInput): ThetaValue {
  const walk: InboundWalk = {
    sidecars: input.sidecars,
    schemaNames: input.schemaNames,
    indexes: new Map(),
  };
  return rebuildUnder(input.validated, input.rootDef, walk);
}

/** Per-walk state shared across the recursion: the sidecar set, the brandable names, and an index cache. */
interface InboundWalk {
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  readonly schemaNames: ReadonlySet<string> | undefined;
  readonly indexes: Map<SchemaSidecar, SidecarIndex>;
}

/** One sidecar's three maps re-keyed for O(1) per-position lookup during a walk. */
interface SidecarIndex {
  readonly wireToTheta: ReadonlyMap<string, string>;
  readonly enumByPointer: ReadonlyMap<string, string>;
  readonly refByPointer: ReadonlyMap<string, string>;
  /** Whether the sidecar omits the `$ref`-target map (the fallback the header comment describes). */
  readonly omitsRefTargets: boolean;
}

/** Index `sidecar` for per-position lookup, memoised for the duration of one walk. */
function indexOf(sidecar: SchemaSidecar, walk: InboundWalk): SidecarIndex {
  const cached = walk.indexes.get(sidecar);
  if (cached !== undefined) {
    return cached;
  }
  const wireToTheta = new Map<string, string>();
  for (const entry of sidecar.wireNames) {
    wireToTheta.set(entry.wire, entry.theta);
  }
  const enumByPointer = new Map<string, string>();
  for (const position of sidecar.namedEnumPositions) {
    enumByPointer.set(position.pointer, position.enumName);
  }
  const refByPointer = new Map<string, string>();
  for (const target of sidecar.refTargets ?? []) {
    refByPointer.set(target.pointer, target.defName);
  }
  const index: SidecarIndex = {
    wireToTheta,
    enumByPointer,
    refByPointer,
    omitsRefTargets: sidecar.refTargets === undefined,
  };
  walk.indexes.set(sidecar, index);
  return index;
}

/**
 * Rebuild `value` under the `$defs` entry `defName`, from that fragment's own
 * root position, and brand the result with `defName` when `walk.schemaNames`
 * names it as a declared `schema`.
 *
 * Branding goes through {@link brandSchemaValue} directly, never through
 * `buildObjectSchemaValue` (`value.ts`): that function's contract reorders a
 * constructed record into DECLARATION order before branding, and reordering an
 * already-validated inbound value is a separate, unsettled question this seam
 * does not decide. `rebuildInbound` is entered here at the empty pointer, where
 * a plain object rebuilds into a fresh record whenever `defName` resolves a
 * sidecar — and a name `walk.schemaNames` admits always does, both sets coming
 * from one derived plan — so the install lands on a record no earlier brand can
 * occupy.
 */
function rebuildUnder(value: unknown, defName: string, walk: InboundWalk): ThetaValue {
  const rebuilt = rebuildInbound(value, walk.sidecars.get(defName), "", walk);
  if (
    walk.schemaNames !== undefined &&
    walk.schemaNames.has(defName) &&
    isPlainObject(rebuilt) &&
    !isResultValue(rebuilt as ThetaValue)
  ) {
    brandSchemaValue(rebuilt as { [key: string]: ThetaValue }, defName);
  }
  return rebuilt;
}

/**
 * Recursively rebuild one inbound value to its theta-side form. `sidecar` is
 * the sidecar of the `$defs` fragment the ENCLOSING value conforms to (or
 * `undefined` when it could not be resolved), and `pointer` is this value's
 * JSON Pointer position within that fragment — so one sidecar covers a field,
 * its array elements, and, at the empty pointer, the fragment's own root.
 * Renames an object's OWN fields wire→theta (nowhere deeper — a nested position
 * belongs to whichever fragment its own sidecar names), reattaches the
 * declaring-enum tag at each named-enum position, and recurses through arrays
 * and `$ref` targets. A `Result` value, and a plain object at a position no
 * sidecar describes, pass through unchanged.
 */
function rebuildInbound(
  value: unknown,
  sidecar: SchemaSidecar | undefined,
  pointer: string,
  walk: InboundWalk,
): ThetaValue {
  const index = sidecar === undefined ? undefined : indexOf(sidecar, walk);
  const enumName = index?.enumByPointer.get(pointer);
  if (enumName !== undefined && typeof value === "string") {
    // Named-enum position: reattach the declaring-enum tag so the rebuilt
    // value compares equal to a locally constructed variant. Anonymous
    // string-literal-union positions are absent from the sidecar and so stay
    // plain strings.
    return makeEnumValue(enumName, value);
  }
  const refTarget = index?.refByPointer.get(pointer);
  if (refTarget !== undefined) {
    return rebuildUnder(value, refTarget, walk);
  }
  if (Array.isArray(value)) {
    // Elements share the enclosing fragment's sidecar, addressed one `/items`
    // segment deeper — an `array<Severity>` element is tagged in place, and an
    // `array<Person>` element's `/items` position carries the `refTarget` that
    // recurses into `Person`.
    return value.map((element) => rebuildInbound(element, sidecar, `${pointer}/items`, walk));
  }
  if (isResultValue(value as ThetaValue)) {
    // runtime-value-model.md §"Wire-name translation" lists `Result.Ok` /
    // `Result.Err` payloads among the things the walk recurses through; this
    // arm does not, and the two reconcile at schema-subset.md §"Lowering
    // Algorithm" step 3: `Result<T, E>` is not a lowerable type form (a
    // `Result` in schema position is a parse error), so no `Result` can arrive
    // from validated JSON at all. The only one reaching this seam is an
    // in-process `invoke` callee's own value — its tail expression can be
    // `Ok(…)` / `Err(…)` directly — whose payload is already theta-side-named
    // and already tagged. Descending into it could only strip brands (the
    // constructor brand `match` and `?` read the discriminator through, and any
    // schema brand the payload carries), never add a tag.
    return value as ThetaValue;
  }
  if (!isPlainObject(value)) {
    return value as ThetaValue;
  }
  if (sidecar === undefined || pointer !== "") {
    // A fresh record is worth building only where the sidecar has something to
    // say about this object's OWN fields — its fragment's root position. A
    // described nested object is entered there by construction: through the
    // `$ref`-target arm above, or through the name-match arm below, both of
    // which re-enter at the empty pointer under the target's own sidecar. Any
    // other position is one no sidecar keys — a union arm, a permissive `{}`,
    // an unresolved reference — so copying would add nothing and would discard
    // a brand the value already carries: an in-process callee's value arrives
    // theta-side and already branded, and both `schemaTagOf` consumers (the
    // QRY-18 outbound render's `as` renames, the `QuestionOperandDefectError`
    // summariser's schema name) degrade silently once the brand is gone.
    return value as ThetaValue;
  }

  const result: { [k: string]: ThetaValue } = {};
  for (const [wireKey, fieldValue] of Object.entries(value)) {
    // The wire-name map describes the fragment's OWN fields, so it applies at
    // the fragment root and nowhere deeper: a value one or more `/items`
    // segments down, or behind an unresolved nested position, is not a field of
    // this schema and must not be re-keyed by its map.
    const thetaKey = pointer === "" ? (index?.wireToTheta.get(wireKey) ?? wireKey) : wireKey;
    const fieldPointer = `${pointer}/properties/${encodePointerSegment(wireKey)}`;
    const fallbackTarget =
      index !== undefined &&
      index.omitsRefTargets &&
      index.enumByPointer.get(fieldPointer) === undefined &&
      walk.sidecars.has(wireKey)
        ? wireKey
        : undefined;
    result[thetaKey] =
      fallbackTarget !== undefined
        ? rebuildUnder(fieldValue, fallbackTarget, walk)
        : rebuildInbound(fieldValue, sidecar, fieldPointer, walk);
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
