// V5f / V5f-T — the schema-lowering and canonical-hash seam.
//
// This module owns the parts of schema-subset.md's Lowering Algorithm and
// Canonical schema hash that the V5f implementation leaf fills in:
//
//   - SUBS-1 (Lowering Algorithm step 3, union lowering): a union all of whose
//     arms are primitive — treating `null` as a primitive — lowers to the
//     multi-type-array form `{ "type": [...] }`; a union with any non-primitive
//     arm lowers to `{ "anyOf": [...] }`. Arms follow the *Array element order*
//     clause: source order, with `"null"` last whenever the union admits it.
//   - Canonical schema hash (schema-subset.md §Canonical schema hash): SHA-256
//     over the keys-sorted, whitespace-free, binder-number-rendered canonical
//     form of the lowered fragment; the schema slug is the first 16 hex
//     characters of the digest (lowercased).
//   - Lowering Algorithm step 5 (per-schema sidecar): a four-map sidecar — a
//     wire-name translation map, a named-enum-position map keyed by JSON
//     Pointer into the lowered fragment, a per-position `$ref`-target map
//     on the same JSON-Pointer keying, naming the `$defs` entry a `$ref`
//     position resolves to (a field `manager: Person` names `$defs` `Person`,
//     not `$defs` `manager`, so a consumer cannot recover the target from the
//     field's own name), and a per-position union-arms map on that same keying,
//     valued by an `anyOf` position's arms in source order.
//   - The `__inline_<slug>` `$defs` dedup of Lowering Algorithm step 2 under the
//     §Schema-slug collision posture byte-equality check: byte-identical
//     fragments sharing a slug dedup silently; a slug match whose fragments are
//     not byte-identical raises the load-time `theta/load/schema-slug-collision`.
//
// V5f-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function so the failing tests compile and red on their own primary
// assertions. The paired V5f implementation leaf fills these in.

import { createHash } from "node:crypto";
import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { renderCanonicalNumber } from "../render/canonical-number";

// --- Canonical schema hash (schema-subset.md §Canonical schema hash) --------

/**
 * A lowered JSON Schema value, the input domain of the canonical schema hash.
 *
 * The `integer` / `number` kinds carry the binder-number-rendering discriminator
 * the canonical form needs for `const` / `enum` numeric positions (the lowering
 * pass knows each literal's declared kind; a plain JSON value would lose it).
 * `object` entries are an ordered list so the emitted lowered fragment can
 * retain theta-source field order while the canonical form sorts keys before
 * hashing.
 */
export type LoweredJsonValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "array"; readonly items: readonly LoweredJsonValue[] }
  | { readonly kind: "object"; readonly entries: readonly LoweredObjectEntry[] };

/** A single key/value entry of a lowered object, in emission order. */
export interface LoweredObjectEntry {
  readonly key: string;
  readonly value: LoweredJsonValue;
}

/**
 * Serialise a lowered fragment to its canonical UTF-8 JSON form
 * (schema-subset.md §Canonical schema hash step 2): object keys sorted by
 * Unicode code-point, no insignificant whitespace, numeric `const` / `enum`
 * literals rendered by the binder integer/number algorithm (BNDR-4 / BNDR-5),
 * array elements left in lowering order, strings RFC 8259 minimal-escaped.
 */
export function canonicalForm(value: LoweredJsonValue): string {
  switch (value.kind) {
    case "string":
      // RFC 8259 minimal escape: JSON.stringify escapes only the characters
      // JSON requires and emits no gratuitous `\u` for printable ASCII.
      return JSON.stringify(value.value);
    case "integer":
    case "number":
      // Numeric `const` / `enum` literals are rendered by the binder
      // integer/number algorithm (BNDR-4 / BNDR-5) keyed off the declared kind,
      // never the value's runtime integrality.
      return renderCanonicalNumber(value.value, value.kind);
    case "boolean":
      return value.value ? "true" : "false";
    case "null":
      return "null";
    case "array":
      // Array elements are left in lowering order; never reordered.
      return `[${value.items.map(canonicalForm).join(",")}]`;
    case "object": {
      // Object keys sorted by Unicode code-point; no insignificant whitespace.
      const sorted = [...value.entries].sort((a, b) =>
        compareCodePoint(a.key, b.key),
      );
      const body = sorted
        .map((entry) => `${JSON.stringify(entry.key)}:${canonicalForm(entry.value)}`)
        .join(",");
      return `{${body}}`;
    }
  }
}

/**
 * Compare two strings by Unicode code-point (lexical) order, as the canonical
 * form's key sort requires. The default `<` on strings compares UTF-16 code
 * units, which diverges from code-point order only across the surrogate range;
 * iterating code points keeps astral keys ordered as the spec mandates.
 */
function compareCodePoint(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const len = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aPoints[i]?.codePointAt(0) ?? 0;
    const bp = bPoints[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) {
      return ap - bp;
    }
  }
  return aPoints.length - bPoints.length;
}

/**
 * The full lowercased hex SHA-256 digest of the canonical-form bytes
 * (schema-subset.md §Canonical schema hash step 3).
 */
export function canonicalHash(value: LoweredJsonValue): string {
  return createHash("sha256")
    .update(canonicalForm(value), "utf8")
    .digest("hex");
}

/**
 * The schema slug — the first 16 hex characters of the canonical hash, i.e. 64
 * bits of the digest (schema-subset.md §Canonical schema hash step 4).
 */
export function schemaSlug(value: LoweredJsonValue): string {
  // `digest("hex")` is already lowercase; the slug is its first 16 hex chars.
  return canonicalHash(value).slice(0, 16);
}

// --- SUBS-1 — union lowering (schema-subset.md §Lowering Algorithm step 3) ---

/** A primitive type name, treating `null` as a primitive (SUBS-1). */
export type LoweredPrimitiveType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

/**
 * One arm of a union being lowered. A `primitive` arm carries the primitive
 * type name; a `non-primitive` arm carries its already-lowered JSON Schema
 * fragment (e.g. a `$ref` object), used only in the `anyOf` lowering.
 */
export type LoweredUnionArm =
  | { readonly kind: "primitive"; readonly type: LoweredPrimitiveType }
  | { readonly kind: "non-primitive"; readonly lowered: Record<string, unknown> };

/**
 * The SUBS-1 union lowering result: the multi-type-array form
 * `{ "type": [...] }` when every arm is primitive, or `{ "anyOf": [...] }` when
 * any arm is non-primitive.
 */
export type LoweredUnion =
  | { readonly type: readonly string[] }
  | { readonly anyOf: readonly Record<string, unknown>[] };

/**
 * Lower a union per SUBS-1: a union all of whose arms are primitive (with
 * `null` counted as a primitive) lowers to `{ "type": [...] }`; any
 * non-primitive arm forces `{ "anyOf": [...] }`. Arms follow the *Array element
 * order* clause — source order, with `"null"` last whenever the union admits it.
 */
export function lowerUnion(arms: readonly LoweredUnionArm[]): LoweredUnion {
  const allPrimitive = arms.every((arm) => arm.kind === "primitive");
  if (allPrimitive) {
    // Multi-type-array form. Arms in source order, with `"null"` last whenever
    // the union admits it (*Array element order* clause).
    const nonNull: string[] = [];
    let hasNull = false;
    for (const arm of arms) {
      if (arm.kind === "primitive") {
        if (arm.type === "null") {
          hasNull = true;
        } else {
          nonNull.push(arm.type);
        }
      }
    }
    return { type: hasNull ? [...nonNull, "null"] : nonNull };
  }
  // Any non-primitive arm forces the `anyOf` form, variants in source order:
  // each primitive arm lowers to its `{ "type": <name> }` object; each
  // non-primitive arm carries its already-lowered fragment.
  const variants: Record<string, unknown>[] = arms.map((arm) =>
    arm.kind === "primitive" ? { type: arm.type } : { ...arm.lowered },
  );
  return { anyOf: variants };
}

// --- Per-schema sidecar (schema-subset.md §Lowering Algorithm step 5) --------

/**
 * The lowered-source shape of one field, classifying whether its position
 * carries a named-enum tag. A named-enum position is included in the sidecar
 * iff its source type was a named `enum` declaration; anonymous
 * string-literal-union positions (`"a" | "b"`) are deliberately absent.
 */
export type SidecarFieldType =
  | { readonly kind: "named-enum"; readonly enumName: string }
  | { readonly kind: "anonymous-string-literal-union" }
  | { readonly kind: "other" };

/**
 * One position nested inside an `array<T>` field: the element type's own
 * classification, plus its own nested element for `array<array<T>>`. An
 * element position carries no field name of its own — the sidecar addresses
 * it by appending `/items` to the enclosing position's pointer, once per
 * level of nesting.
 */
export interface SidecarElementInput {
  readonly type: SidecarFieldType;
  /** The `$defs` name this element's lowered position references, when it is a `$ref`. */
  readonly refTarget?: string;
  /** The element of a nested `array<array<T>>` position. */
  readonly element?: SidecarElementInput;
  /** This element's union arms, when its lowered position is an `anyOf`. */
  readonly unionArms?: readonly SidecarUnionArm[];
}

/** One field of a `$defs` entry, with its JSON Pointer into the lowered fragment. */
export interface SidecarFieldInput {
  readonly thetaName: string;
  /** The explicit `as "Wire"` rename, when present. */
  readonly wireName?: string;
  /** JSON Pointer into the lowered fragment naming this field's position. */
  readonly pointer: string;
  readonly type: SidecarFieldType;
  /**
   * The `$defs` name this field's lowered position references, when that
   * position is a `$ref`. Recorded per position rather than inferred from the
   * field name: `manager: Person` references `$defs` `Person`, so a consumer
   * recursing by matching the field's own name against `$defs` keys resolves
   * only the coincidence where the two happen to agree.
   */
  readonly refTarget?: string;
  /** This field's element position, when the field's type is `array<T>`. */
  readonly element?: SidecarElementInput;
  /** This field's union arms, when its lowered position is an `anyOf`. */
  readonly unionArms?: readonly SidecarUnionArm[];
}

/** A wire-name translation entry: the theta-side name and its wire name. */
export interface WireNameEntry {
  readonly theta: string;
  readonly wire: string;
}

/** A named-enum position: a JSON Pointer keyed to the declaring enum's name. */
export interface NamedEnumPosition {
  readonly pointer: string;
  readonly enumName: string;
}

/**
 * A `$ref` target position: a JSON Pointer (on the same keying as the other
 * two maps) paired with the `$defs` name its lowered position references.
 */
export interface SidecarRefTarget {
  readonly pointer: string;
  readonly defName: string;
}

/**
 * One arm of a lowered `{ "anyOf": [...] }` position, carrying what the inbound
 * pass needs to (a) re-test a value against the arm and (b) translate under it
 * once the arm is chosen.
 *
 * `document` is the arm's own fragment plus the enclosing document's `$defs`,
 * so it is a self-contained lowered document the `SchemaValidator` seam can
 * compile — the SAME compile route and the SAME content-addressed cache the
 * boundary's own verdict came from, never a second validation path.
 */
export interface SidecarUnionArm {
  /** Self-contained lowered document for this arm: the arm fragment plus `$defs`. */
  readonly document: Record<string, unknown>;
  /** The declaring `enum` name, when this arm is a named-`enum` `$ref` (terminal — an enum position has nothing beneath it). */
  readonly enumName?: string;
  /** The `$defs` name the walk re-enters under, when this arm has structure of its own. */
  readonly defName?: string;
}

/**
 * A union position: a JSON Pointer (the same keying as the other three maps)
 * paired with the position's arms in SUBS-1 source order — the order the
 * lowered `anyOf` array already carries (schema-subset.md §"Lowering
 * Algorithm" step 3, *Array element order*).
 */
export interface SidecarUnionPosition {
  readonly pointer: string;
  readonly arms: readonly SidecarUnionArm[];
}

/** The four-map per-schema sidecar plus its field-order list (Lowering Algorithm step 5). */
export interface SchemaSidecar {
  readonly wireNames: readonly WireNameEntry[];
  readonly namedEnumPositions: readonly NamedEnumPosition[];
  /**
   * Per-position `$ref` targets. Optional so a sidecar that omits the map
   * still satisfies the interface; a consumer that finds no map here falls
   * back to matching a position's wire name against a `$defs` key — faithful
   * only where the two happen to agree.
   */
  readonly refTargets?: readonly SidecarRefTarget[];
  /**
   * This `$defs` entry's own object-body field names, theta-side, in
   * theta-source DECLARATION order — the order the emitted `properties` /
   * `required` already carry (step 3, *Array element order*). The inbound
   * translation pass reads it to rebuild a validated object's fields in
   * declaration order, so a MODEL-ordered payload and a locally constructed
   * value of the same schema agree on `keys()` (expressions.md §"Built-in
   * methods and properties"). Absent for a `$defs` entry with no object body;
   * where a list is present the fields it names come first in declaration
   * order and every remaining payload key follows in the relative order the
   * payload carried — a sidecar carrying no field-order list preserves
   * payload order unchanged.
   */
  readonly fieldOrder?: readonly string[];
  /**
   * Per-position union arms, on the same JSON-Pointer keying as the other
   * maps: one entry per `{ "anyOf": [...] }` position in this fragment, valued
   * by the position's arms in source order. The inbound translation pass
   * re-tests an admitted value against each arm in that order and translates
   * under the FIRST arm that admits it. Absent — not an empty list — for a
   * fragment carrying no union position, so a sidecar whose lowered fragment
   * has no `anyOf` is byte-identical to one carrying no such map.
   */
  readonly unionArms?: readonly SidecarUnionPosition[];
}

/**
 * Build the per-schema sidecar: a wire-name translation map (one entry per
 * renamed field), a named-enum-position map keyed by JSON Pointer (one entry
 * per named-`enum` position; anonymous string-literal-union positions absent),
 * a `$ref`-target map on the same pointer keying (one entry per position
 * whose lowered form is a `$ref`), a union-arms map on the same keying (one
 * entry per `anyOf` position, valued by the position's arms), and an optional
 * field-order list. An `array<T>` field's element position is addressed by
 * appending `/items` to the field's own pointer, once per level of
 * `array<array<T>>` nesting, so an element can carry its own named-enum tag,
 * `$ref` target or union arms exactly as a field can.
 *
 * `fieldOrder` is the fragment's own declaration-ordered theta-side field
 * names, supplied only by a caller that knows `fields` describes an object
 * body's own fields (an array element or a non-object root is a position, not
 * a field, and orders nothing). Omitted, the sidecar carries no order and the
 * inbound walk keeps payload order. `exactOptionalPropertyTypes` is on, so the
 * key is spread in only when a caller supplies one.
 */
export function buildSidecar(
  fields: readonly SidecarFieldInput[],
  fieldOrder?: readonly string[],
): SchemaSidecar {
  const wireNames: WireNameEntry[] = [];
  const namedEnumPositions: NamedEnumPosition[] = [];
  const refTargets: SidecarRefTarget[] = [];
  const unionArms: SidecarUnionPosition[] = [];
  const record = (
    pointer: string,
    type: SidecarFieldType,
    refTarget: string | undefined,
    arms: readonly SidecarUnionArm[] | undefined,
  ): void => {
    // Named-enum positions: included iff the source type was a named `enum`;
    // anonymous string-literal-union positions are deliberately absent.
    if (type.kind === "named-enum") {
      namedEnumPositions.push({ pointer, enumName: type.enumName });
    }
    if (refTarget !== undefined) {
      refTargets.push({ pointer, defName: refTarget });
    }
    if (arms !== undefined) {
      unionArms.push({ pointer, arms });
    }
  };
  for (const field of fields) {
    // Wire-name translation: one entry per *renamed* field; un-renamed fields
    // (wire name equals theta name) are absent.
    if (field.wireName !== undefined && field.wireName !== field.thetaName) {
      wireNames.push({ theta: field.thetaName, wire: field.wireName });
    }
    record(field.pointer, field.type, field.refTarget, field.unionArms);
    let element = field.element;
    let elementPointer = field.pointer;
    while (element !== undefined) {
      elementPointer = `${elementPointer}/items`;
      record(elementPointer, element.type, element.refTarget, element.unionArms);
      element = element.element;
    }
  }
  return {
    wireNames,
    namedEnumPositions,
    refTargets,
    ...(fieldOrder !== undefined ? { fieldOrder } : {}),
    // Spread in only where the fragment HAS a union position, so every sidecar
    // of a union-free fragment is byte-identical to the four-item shape.
    ...(unionArms.length > 0 ? { unionArms } : {}),
  };
}

// --- Inbound translation plan (runtime-value-model.md §Wire-name translation) -

/**
 * The per-`$defs` sidecars an inbound boundary needs to translate a validated
 * value, the `$defs` name the validated value itself conforms to, and the
 * subset of `$defs` names that are declared theta-side `schema` names — the
 * only names a rebuilt object may be branded with, so a caller cannot brand a
 * `#root` position or a minted `__inline_<slug>` entry as if either were an
 * author-declared schema.
 */
export interface InboundTranslationPlan {
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  readonly rootDef: string;
  readonly schemaNames: ReadonlySet<string>;
}

/**
 * The reserved `$defs` key an inbound plan registers the lowered document's
 * OWN root fragment under, when the annotation is not a bare declared name
 * (e.g. `array<Sev>`, an inline `{…}` annotation). `#` falls outside the
 * identifier alphabet (lexical.md's `[A-Za-z_][A-Za-z0-9_]*`), so this key can
 * never equal a declared `schema` / `enum` name or a minted `__inline_<slug>`
 * entry.
 */
const ROOT_DEF_KEY = "#root";

/** An identifier-shaped annotation names a declared `schema` or `enum` directly. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A `$ref` naming a document-root `$defs` entry — the only `$ref` form lowering emits. */
const DEFS_REF = /^#\/\$defs\/(.+)$/;

/** Whether `value` is a plain (non-array, non-null) JS object. */
function isFragment(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a lowered fragment is the enum / string-literal-union form (step 3, `enum`). */
function isEnumFragment(fragment: Record<string, unknown>): boolean {
  return fragment["type"] === "string" && Array.isArray(fragment["enum"]);
}

/** Whether a lowered fragment is the object form (step 3, `Object`), carrying `properties`. */
function isObjectFragment(fragment: Record<string, unknown>): boolean {
  return fragment["type"] === "object" && isFragment(fragment["properties"]);
}

/** The classification of one lowered position — the shape a field and an array element share. */
interface PositionClass {
  readonly type: SidecarFieldType;
  readonly refTarget?: string;
  readonly element?: SidecarElementInput;
  readonly unionArms?: readonly SidecarUnionArm[];
}

/** The lowered document and declaration names an inbound plan is derived against. */
export interface InboundTranslationPlanInput {
  /** The lowered schema document the validated value was checked against. */
  readonly lowered: Record<string, unknown>;
  /** The verbatim annotation source `lowered` was produced from. */
  readonly annotation: string;
  /** The caller's declared `schema` names — the only names a rebuilt object may be branded with. */
  readonly schemaNames: ReadonlySet<string>;
  /**
   * The caller's declared `enum` names. A string position is tagged only when
   * its lowered fragment belongs to one of these: a `schema S = "a" | "b"`
   * alias lowers to the identical `{ "type": "string", "enum": […] }` shape as
   * an `enum` declaration, and step 5 admits a position "iff its source type
   * was a named `enum` declaration" — an alias is a `schema`, not an `enum`.
   */
  readonly enumNames: ReadonlySet<string>;
}

/**
 * Derive the inbound translation plan for a lowered schema document: one
 * sidecar per `$defs` entry that carries an object or enum body, plus one for
 * the document root (the annotation's own top-level fragment, which a named
 * arm returns directly rather than as a `$ref`).
 *
 * The plan is derived from the LOWERED document rather than carried alongside
 * it by the lowering pass, because the object-form lowering this seam's
 * callers use (`lowerObjectFields`, via `LowerableField`) has no `as "Wire"`
 * rename to lower with — a field's `properties` key is already its
 * theta-side name. Every sidecar this function returns therefore carries an
 * EMPTY wire-name map, which is what a boundary whose payload already arrives
 * theta-side-keyed requires: renaming an already-theta-side key would corrupt
 * it. What the plan does carry is the re-tag, recursion and arm-dispatch
 * information — named-enum positions, per-position `$ref` targets and
 * per-position union arms — which a theta-side-keyed payload still needs
 * exactly as a wire-keyed one would.
 *
 * `input.schemaNames` bounds which `$defs` names may be branded: only a name
 * in that set is a `schema` the caller declared, so a `#root` position or a
 * synthesised `__inline_<slug>` entry — present in `sidecars` for recursion,
 * but never in `schemaNames` — is never mistaken for one.
 */
export function buildInboundTranslationPlan(
  input: InboundTranslationPlanInput,
): InboundTranslationPlan {
  const { lowered, annotation, schemaNames: declaredSchemaNames, enumNames } = input;
  const defsSource = lowered["$defs"];
  const fragments = new Map<string, Record<string, unknown>>();
  if (isFragment(defsSource)) {
    for (const [name, fragment] of Object.entries(defsSource)) {
      if (isFragment(fragment)) {
        fragments.set(name, fragment);
      }
    }
  }

  const annotationName = annotation.trim();
  const rootDef = IDENTIFIER.test(annotationName) ? annotationName : ROOT_DEF_KEY;
  const rootBody: Record<string, unknown> = { ...lowered };
  delete rootBody["$defs"];
  // A self-referential named schema's OWN `$defs` entry carries this same body
  // (byte-for-byte — both trace back to the identical lowered fragment); every
  // other annotation's root key is either unclaimed or the reserved `#root`.
  // Either way the root fragment is authoritative for its key.
  fragments.set(rootDef, rootBody);

  const sidecars = new Map<string, SchemaSidecar>();
  const pending: string[] = [...fragments.keys()];
  /**
   * Describe one arm of an `anyOf` position: the self-contained lowered
   * document the arm is re-tested against, plus how the walk translates under
   * it once chosen. An arm with structure of its own — an object `$ref`, an
   * inline object, an `array<T>` — names a `$defs` entry the walk re-enters at
   * that entry's own root, which is what gives an admitted arm the same reach
   * a non-union position of the same shape already has.
   */
  const describeArm = (owner: string, armPointer: string, arm: unknown): SidecarUnionArm => {
    const fragment = isFragment(arm) ? arm : {};
    // The arm fragment alone is not compilable: its `$ref`s address the
    // enclosing document's `$defs`, so the arm document carries that same
    // `$defs` object.
    const document: Record<string, unknown> = isFragment(defsSource)
      ? { ...fragment, $defs: defsSource }
      : { ...fragment };
    const classified = classify(owner, armPointer, arm);
    if (classified.type.kind === "named-enum") {
      return { document, enumName: classified.type.enumName };
    }
    if (classified.refTarget !== undefined) {
      return { document, defName: classified.refTarget };
    }
    if (classified.element !== undefined) {
      // An `array<T>` arm. `classify` mints a `$defs` entry for an inline
      // OBJECT position but not for an array one, because an array position is
      // addressable from its enclosing fragment by `/items`; an arm is not, so
      // mint here and let the pending loop classify the arm fragment in place
      // at its own root.
      const minted = `#${owner}${armPointer}`;
      if (!fragments.has(minted)) {
        fragments.set(minted, fragment);
        pending.push(minted);
      }
      return { document, defName: minted };
    }
    // A primitive, `const` or otherwise position-less arm: it admits or it does
    // not, and translating under it adds nothing.
    return { document };
  };
  const classify = (owner: string, pointer: string, position: unknown): PositionClass => {
    if (!isFragment(position)) {
      return { type: { kind: "other" } };
    }
    const ref = position["$ref"];
    if (typeof ref === "string") {
      const match = DEFS_REF.exec(ref);
      const target = match?.[1];
      const targetFragment = target === undefined ? undefined : fragments.get(target);
      if (target === undefined || targetFragment === undefined) {
        return { type: { kind: "other" } };
      }
      if (isEnumFragment(targetFragment)) {
        // A named-enum `$ref` is terminal: an enum position has no fields or
        // elements of its own to recurse into.
        return enumNames.has(target)
          ? { type: { kind: "named-enum", enumName: target } }
          : { type: { kind: "anonymous-string-literal-union" } };
      }
      return { type: { kind: "other" }, refTarget: target };
    }
    const anyOf = position["anyOf"];
    if (Array.isArray(anyOf)) {
      // SUBS-1: a union with any non-primitive arm lowers to `anyOf`, arms in
      // source order. The arms are recorded as their own map rather than as
      // named-enum / `$ref`-target entries at this pointer, because which arm
      // governs is not knowable until a value is in hand — the other three maps
      // stay statements about the position itself.
      return {
        type: { kind: "other" },
        unionArms: anyOf.map((arm, armIndex) =>
          describeArm(owner, `${pointer}/anyOf/${armIndex}`, arm),
        ),
      };
    }
    if (position["type"] === "array") {
      return {
        type: { kind: "other" },
        element: classify(owner, `${pointer}/items`, position["items"]),
      };
    }
    if (isEnumFragment(position)) {
      // An inline `{ "type": "string", "enum": […] }` position is an anonymous
      // string-literal union — step 5 keeps those out of the sidecar so
      // equality on them stays plain string equality.
      return { type: { kind: "anonymous-string-literal-union" } };
    }
    if (isObjectFragment(position)) {
      // An object position emitted in place rather than hoisted to `$defs`.
      // Mint a reserved key so the walk can recurse against its own sidecar;
      // the key is `#`-prefixed and position-derived, so it is unique in this
      // document and never brandable as a declared name.
      const minted = `#${owner}${pointer}`;
      if (!fragments.has(minted)) {
        fragments.set(minted, position);
        pending.push(minted);
      }
      return { type: { kind: "other" }, refTarget: minted };
    }
    return { type: { kind: "other" } };
  };

  while (pending.length > 0) {
    const name = pending.shift() as string;
    if (sidecars.has(name)) {
      continue;
    }
    const fragment = fragments.get(name);
    if (fragment === undefined) {
      continue;
    }
    const inputs: SidecarFieldInput[] = [];
    let fieldOrder: readonly string[] | undefined;
    const properties = fragment["properties"];
    if (isObjectFragment(fragment) && isFragment(properties)) {
      for (const [field, position] of Object.entries(properties)) {
        const pointer = `/properties/${encodePointerSegment(field)}`;
        inputs.push({ thetaName: field, pointer, ...classify(name, pointer, position) });
      }
      // Step 5's field-order list: `properties` is emitted in theta-source
      // declaration order (step 3, *Array element order* — `required` lists
      // wire names "in declaring-field order (matching the `properties` order
      // of the same Object form)"), and `Object.entries` answers a fragment's
      // own identifier-shaped keys in insertion order, so the walk above IS the
      // declaration order — no second source is consulted. The other two
      // branches below push a POSITION, not a field (a named-enum root, a
      // non-object root), and supply no order.
      fieldOrder = inputs.map((input) => input.thetaName);
    } else if (isEnumFragment(fragment) && enumNames.has(name)) {
      // The annotation names an `enum` outright (`invoke<Sev>`): the ROOT
      // position is itself the named-enum position — tags attach "at the same
      // depth as the value the schema annotates" (runtime-value-model.md
      // §Wire-name translation). The empty pointer addresses the fragment
      // itself.
      inputs.push({ thetaName: name, pointer: "", type: { kind: "named-enum", enumName: name } });
    } else {
      // Any other non-object root — `invoke<array<Sev>>`, an inline literal
      // union, a bare primitive — classified in place so an array root's
      // elements still resolve.
      inputs.push({ thetaName: name, pointer: "", ...classify(name, "", fragment) });
    }
    sidecars.set(name, buildSidecar(inputs, fieldOrder));
  }

  const schemaNames = new Set<string>();
  for (const name of sidecars.keys()) {
    if (declaredSchemaNames.has(name)) {
      schemaNames.add(name);
    }
  }
  return { sidecars, rootDef, schemaNames };
}

/** Encode an RFC 6901 JSON Pointer segment (`~`→`~0`, `/`→`~1`). */
export function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

// --- `__inline_<slug>` `$defs` dedup (schema-subset.md §Lowering step 2 + ----
//     §Schema-slug collision posture) -------------------------------------

/** A located site at which the inline-schema dedup runs. */
export interface SchemaLoweringSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * A lowered inline-schema fragment keyed by its schema slug, carrying the
 * canonical-form bytes alongside so the slug-collision posture's byte-equality
 * check is a byte comparison, not a re-serialisation.
 */
export interface SlugKeyedFragment {
  readonly slug: string;
  readonly canonicalBytes: string;
  readonly defName: string;
}

/** The dedup outcome: the retained `$defs` entries and any collision diagnostics. */
export interface InlineDedupResult {
  readonly entries: readonly SlugKeyedFragment[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Dedup `__inline_<slug>` `$defs` entries (Lowering Algorithm step 2) under the
 * §Schema-slug collision posture byte-equality check: fragments sharing a slug
 * with byte-identical canonical forms collapse to one entry silently; a slug
 * match whose canonical-form bytes differ raises `theta/load/schema-slug-collision`
 * and refuses to merge the two fragments.
 */
export function dedupInlineSchemas(
  fragments: readonly SlugKeyedFragment[],
  site: SchemaLoweringSite,
): InlineDedupResult {
  const entries: SlugKeyedFragment[] = [];
  const diagnostics: Diagnostic[] = [];
  // First fragment retained per slug, with its canonical-form bytes, so a slug
  // match is settled by byte comparison rather than re-serialisation.
  const retained = new Map<string, SlugKeyedFragment>();
  for (const fragment of fragments) {
    const prior = retained.get(fragment.slug);
    if (prior === undefined) {
      retained.set(fragment.slug, fragment);
      entries.push(fragment);
      continue;
    }
    if (prior.canonicalBytes === fragment.canonicalBytes) {
      // Byte-identical: cosmetic source differences that lower alike collapse to
      // one `$defs` entry, silently.
      continue;
    }
    // Slug match with differing canonical-form bytes: a genuine 64-bit slug
    // collision. Refuse to merge and raise the load-time diagnostic.
    diagnostics.push({
      severity: "error",
      code: "theta/load/schema-slug-collision",
      file: site.file,
      range: site.range,
      message: `schema-slug collision on slug ${fragment.slug}: two distinct inline schemas hash alike`,
    });
  }
  return { entries, diagnostics };
}

// --- The plain-object → `LoweredJsonValue` bridge (shared by every mint) ---

/**
 * The values JSON has no representation for, and whose disposition therefore
 * depends on the POSITION they occupy rather than on the value itself: an
 * object property holding one is omitted, an array element holding one becomes
 * `null` (both per `JSON.stringify`).
 */
function isJsonUnrepresentable(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

/**
 * Convert a JSON-ish value — nested objects, arrays, strings, numbers,
 * booleans, `null` — to the `LoweredJsonValue` the canonical-hash recipe
 * ({@link canonicalForm} / {@link schemaSlug}) reads.
 *
 * THE DOMAIN IS PLAIN JSON. The one caller rooted in a foreign value —
 * PIC-11's per-query validator cache key, which the pre-dispatch AJV safety
 * net drives over `PiToolDispatch.parameters` from the host tool registry —
 * normalises its argument to plain JSON in `productionSchemaSlugOf` before
 * this function sees it, so the exotic JS shapes (`toJSON` bearers, boxed
 * primitives, circular structures) are resolved by the serialiser the
 * canonical form is defined against rather than re-derived here.
 *
 * The arms below nevertheless keep the bridge a TOTAL function over PLAIN
 * JSON: every plain-object, array, string, number, boolean and `null` shape
 * has a defined answer, with no arm left unreached. Resolving an exotic JS
 * shape (a `toJSON` bearer, a boxed primitive, a sparse array, a circular
 * structure) into that domain is the NORMALISING CALLER's obligation, not
 * this bridge's — discharged for the one foreign-rooted caller by
 * `productionSchemaSlugOf` above. Each arm answers as `JSON.stringify` does
 * over the domain it is total on, because the canonical
 * form (step 2, schema-subset.md:99–:105) is a digest of the fragment AS A
 * JSON DOCUMENT: a value JSON cannot represent is not in that document at all,
 * so the bridge must not render one.
 * - An object property whose value is `undefined`, a function, or a symbol is
 *   OMITTED from the entry list — `JSON.stringify` writes no such key, so the
 *   key is absent from the document being digested.
 * - An ARRAY position holding `undefined`, a function, a symbol, or nothing at
 *   all (an elided element) becomes `null` — `JSON.stringify` writes `null`
 *   there, because an array's length is part of its value, so every index
 *   below it is visited whether or not the array has an own property for it.
 * - A `bigint` is REFUSED with a `TypeError`, the one disposition
 *   `JSON.stringify` itself gives it ("Do not know how to serialize a
 *   BigInt"). Refusing at the bridge rather than falling through is what keeps
 *   the outcome no worse than the serialisation this replaced: the fall-through
 *   arm would read `Object.entries(1n)` as `[]` and mint the slug of `{}`,
 *   silently digesting a document the value is not. No rendering is invented
 *   because the recipe pins none, and inventing one would fix a wire format by
 *   accident.
 * - A NON-FINITE number (`NaN`, `Infinity`, `-Infinity`) becomes `null` in
 *   EVERY position, property and array element alike, which is the disposition
 *   `JSON.stringify` gives it (`{"a":null}`, `[null]`): it is neither omitted
 *   like `undefined` nor refused like a `bigint`, so no positional
 *   special-casing arises. Two properties follow. ONE rule governs the whole
 *   bridge — the JSON data model as `JSON.stringify` resolves it — rather than
 *   two a reader must hold apart. And byte-agreement with the serialisation the
 *   PIC-44 stored bytes and any replayed provider payload were produced from is
 *   preserved, since a non-finite value hashes as `null` on both sides, so no
 *   cached artefact moves for that shape. Rendering the value instead would put
 *   a bare `Infinity` / `NaN` token in the digested bytes — text that is not a
 *   JSON document and that no other implementation can reproduce, the exact
 *   failure the recipe exists to prevent (schema-subset.md:94, :110).
 * - `undefined`, a function or a symbol AT THE ROOT is likewise refused: those
 *   positions have no JSON document (`JSON.stringify` returns `undefined`, not
 *   a string), hence nothing to digest. Every production caller guards the root
 *   to a non-null non-array object, so the arm is a total-function boundary
 *   rather than a reachable path.
 *
 * WHY it lives beside the recipe rather than beside any one caller: every
 * synthesised name schema-subset.md:108 mints (`__inline_`,
 * `__theta_respond_`, `__theta_bind_`, and `__theta_callee_` when it gains a
 * production mint) must be a function of the fragment alone, so all of them
 * serialise through ONE bridge and ONE serialiser rather than through per-site
 * re-implementations that can disagree about one fragment.
 *
 * The `integer` / `number` split is taken from the value's integrality where
 * the recipe selects BNDR-4 / BNDR-5 on the DECLARED kind. That is not a byte
 * difference: `renderCanonicalNumber` (src/render/canonical-number.ts) routes
 * both of its switch arms through the same `canonicalDecimal` computation, so
 * the two rules emit identical bytes for every finite input and the
 * discriminator cannot move a slug. Threading a declared kind through the
 * lowering would change which arm is named, never which bytes are hashed.
 *
 * Object entries are walked in insertion order; `canonicalForm` sorts them by
 * Unicode code point before hashing, so the emitted fragment's key order and
 * the digest are independent (schema-subset.md:110).
 */
export function toLoweredJsonValue(value: unknown): LoweredJsonValue {
  if (typeof value === "string") {
    return { kind: "string", value };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value };
  }
  if (typeof value === "number") {
    // `Number.isFinite` and not the global `isFinite`: the global coerces its
    // argument, and only the three non-finite doubles are meant here.
    return !Number.isFinite(value)
      ? { kind: "null" }
      : Number.isInteger(value)
        ? { kind: "integer", value }
        : { kind: "number", value };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "bigint") {
    throw new TypeError(
      "schema-slug canonical form: a bigint has no JSON representation, so the lowered " +
        "fragment has no canonical form to digest (schema-subset.md:98-:107)",
    );
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      // `Array.from` visits every index in `[0, length)`; `Array.prototype.map`
      // skips holes and preserves them, which would leave a hole in `items`
      // for `canonicalForm`'s `join` to render as empty text rather than as
      // the `null` a hole's JSON representation is.
      items: Array.from(value as readonly unknown[], (item) =>
        isJsonUnrepresentable(item) ? { kind: "null" } : toLoweredJsonValue(item),
      ),
    };
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `schema-slug canonical form: a root value of type ${typeof value} has no JSON ` +
        "representation, so there is no document to digest (schema-subset.md:98-:107)",
    );
  }
  const entries: LoweredObjectEntry[] = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => !isJsonUnrepresentable(entryValue))
    .map(([key, entryValue]) => ({ key, value: toLoweredJsonValue(entryValue) }));
  return { kind: "object", entries };
}
