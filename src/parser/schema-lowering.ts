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
//   - Lowering Algorithm step 5 (per-schema sidecar): a three-map sidecar — a
//     wire-name translation map, a named-enum-position map keyed by JSON
//     Pointer into the lowered fragment, and a per-position `$ref`-target map
//     on the same JSON-Pointer keying, naming the `$defs` entry a `$ref`
//     position resolves to (a field `manager: Person` names `$defs` `Person`,
//     not `$defs` `manager`, so a consumer cannot recover the target from the
//     field's own name).
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

/** The three-map per-schema sidecar plus its field-order list (Lowering Algorithm step 5). */
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
}

/**
 * Build the per-schema sidecar: a wire-name translation map (one entry per
 * renamed field), a named-enum-position map keyed by JSON Pointer (one entry
 * per named-`enum` position; anonymous string-literal-union positions absent),
 * a `$ref`-target map on the same pointer keying (one entry per position
 * whose lowered form is a `$ref`), and an optional field-order list. An
 * `array<T>` field's element position is addressed by appending `/items` to
 * the field's own pointer, once per level of `array<array<T>>` nesting, so an
 * element can carry its own named-enum tag or `$ref` target exactly as a field
 * can.
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
  const record = (
    pointer: string,
    type: SidecarFieldType,
    refTarget: string | undefined,
  ): void => {
    // Named-enum positions: included iff the source type was a named `enum`;
    // anonymous string-literal-union positions are deliberately absent.
    if (type.kind === "named-enum") {
      namedEnumPositions.push({ pointer, enumName: type.enumName });
    }
    if (refTarget !== undefined) {
      refTargets.push({ pointer, defName: refTarget });
    }
  };
  for (const field of fields) {
    // Wire-name translation: one entry per *renamed* field; un-renamed fields
    // (wire name equals theta name) are absent.
    if (field.wireName !== undefined && field.wireName !== field.thetaName) {
      wireNames.push({ theta: field.thetaName, wire: field.wireName });
    }
    record(field.pointer, field.type, field.refTarget);
    let element = field.element;
    let elementPointer = field.pointer;
    while (element !== undefined) {
      elementPointer = `${elementPointer}/items`;
      record(elementPointer, element.type, element.refTarget);
      element = element.element;
    }
  }
  return {
    wireNames,
    namedEnumPositions,
    refTargets,
    ...(fieldOrder !== undefined ? { fieldOrder } : {}),
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
 * it. What the plan does carry is the re-tag and recursion information —
 * named-enum positions and per-position `$ref` targets — which a
 * theta-side-keyed payload still needs exactly as a wire-keyed one would.
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
function encodePointerSegment(segment: string): string {
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
