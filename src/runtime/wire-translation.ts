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
//     `V5f`-produced wire-name sidecar), (b) at every position the lowering
//     pass's *Named-enum positions* sidecar maps to a declaring-enum name,
//     reattaches that enum's tag (via the `V2c` `makeEnumValue` representation)
//     so the resulting value compares equal to a locally constructed variant of
//     the same enum, and (c) orders each rebuilt object's own fields by the
//     lowering pass's *Field order* list (schema-subset.md §"Lowering
//     Algorithm" step 5), so a MODEL-ordered payload's `keys()` is the
//     declaration order expressions.md §"Built-in methods and properties"
//     fixes for a named schema — the same order `buildObjectSchemaValue`
//     establishes for a constructor-built value. Every field the list names
//     comes first in declaration order, and every remaining payload key follows
//     in the relative order the payload carried. Anonymous string-literal-union
//     positions are absent from the sidecar and receive no tag — equality on
//     those falls back to plain string equality (`Severity.Low == "low"`
//     remains `false`). The walk recurses through arrays, nested object fields
//     and `$ref` targets, and passes a `Result` value through unchanged:
//     `Result` is not a lowerable type form (schema-subset.md §"Lowering
//     Algorithm" step 3), so no `Result` can arrive from validated JSON; the
//     only one reaching this seam is an in-process `invoke` callee's own
//     value, already theta-side and already tagged. Theta code never sees
//     wire names.
//   - *Outbound* (theta value → JSON): the runtime walks the theta-side value and
//     produces wire-named JSON before AJV validation.
//
//   Frontmatter `params:` defaults DO reach this pass: the merged `args`
//   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) produces, defaulted
//   fields included, are exactly what the binder-`args` inbound boundary
//   (`bindParamsInbound`, `inbound-boundary.ts`) translates, so a default in WIRE
//   form is re-tagged / re-branded here exactly as any other validated value is.
//   `runtime-value-model.md:37` states the same mechanism: a default projected
//   to wire form crosses the binder-`args` inbound boundary like any other
//   validated value, so a named-enum position is re-tagged and a schema-typed
//   one re-branded here rather than arriving pre-tagged from frontmatter.
//
// **The positions this pass reaches.** The sidecar is keyed by JSON Pointer
// into the lowered schema fragment, so the pass applies exactly where a pointer
// addresses a value: the annotated root, a named-enum position, a `$ref`
// target's own fragment, an array element one `/items` segment deeper, and a
// `{"anyOf":[…]}` position. `anyOf` has no fixed image in the data space the
// way `properties` and `items` do, so at a union position the walk re-tests
// the value against each arm in source order and translates under the FIRST
// arm that admits it (runtime-value-model.md §"Wire-name translation", the
// inbound bullet's union clause), compiling each arm through the caller's own
// `SchemaValidator`. Two arms both admitting is settled by that same order —
// the earlier arm governs. No arm admitting, or no validator supplied, leaves
// the value exactly as AJV validated it: no rename, no enum tag, no brand, and
// no descent beneath it.
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

import { type SchemaSidecar, type SidecarUnionArm } from "../parser/schema-lowering";
import type {
  CompiledValidator,
  LoweredSchema,
  SchemaValidator,
} from "../seams/schema-validator";
import {
  brandSchemaValue,
  isResultValue,
  makeEnumValue,
  schemaTagOf,
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
  /**
   * The compiled-validator seam the union-arm dispatch re-tests a value
   * against. Only `compile` is used, and it is the caller's OWN validator — the
   * one whose verdict admitted this value — so an arm re-test goes through the
   * same content-addressed compiled-validator cache (`../seams/schema-validator`)
   * rather than a second compile route.
   *
   * Absent: no arm dispatch runs and a value inside a union arm passes through
   * exactly as it did before the rule existed. Every sidecar derived from a
   * union-free fragment carries no `unionArms` map at all, so a caller with no
   * union position in its document is unaffected either way.
   */
  readonly schemaValidator?: Pick<SchemaValidator, "compile">;
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
 * orders each described object's own fields by the sidecar's field-order list
 * (schema-subset.md §"Lowering Algorithm" step 5), and — where `schemaNames`
 * names the position's `$defs` entry — brands a rebuilt object with its
 * declaring schema. The walk recurses through arrays, nested object fields and
 * a `$ref` position's own `$defs` entry; at a `{"anyOf":[…]}` position it
 * re-tests the value against each arm in source order and descends under the
 * FIRST arm that admits it (runtime-value-model.md §"Wire-name translation",
 * the inbound bullet's union clause), given `input.schemaValidator` to compile
 * the arms through. Theta code never sees a wire name at any depth.
 *
 * Its reach is the set of positions the sidecar's JSON Pointers address — the
 * annotated root, named-enum positions, `$ref` targets, array elements, and a
 * union position whose admitting arm resolves one of those same kinds. No arm
 * admitting a value, or no `schemaValidator` supplied, returns the value
 * exactly as AJV validated it.
 */
export function translateInbound(input: InboundTranslationInput): ThetaValue {
  const walk: InboundWalk = {
    sidecars: input.sidecars,
    schemaNames: input.schemaNames,
    indexes: new Map(),
    schemaValidator: input.schemaValidator,
    armValidators: new Map(),
  };
  return rebuildUnder(input.validated, input.rootDef, walk);
}

/** Per-walk state shared across the recursion: the sidecar set, the brandable names, and an index cache. */
interface InboundWalk {
  readonly sidecars: ReadonlyMap<string, SchemaSidecar>;
  readonly schemaNames: ReadonlySet<string> | undefined;
  readonly indexes: Map<SchemaSidecar, SidecarIndex>;
  /** The seam an arm re-test compiles through; absent disables arm dispatch. */
  readonly schemaValidator: Pick<SchemaValidator, "compile"> | undefined;
  /**
   * Per-arm compiled validators, memoised for the duration of one walk. The
   * seam's own cache is content-addressed and already deduplicates the
   * compile; this memo skips re-addressing the same arm once per element of an
   * `array<T | null>`.
   */
  readonly armValidators: Map<SidecarUnionArm, CompiledValidator>;
}

/** One sidecar's four maps re-keyed for O(1) per-position lookup during a walk, plus its field order. */
interface SidecarIndex {
  readonly wireToTheta: ReadonlyMap<string, string>;
  readonly enumByPointer: ReadonlyMap<string, string>;
  readonly refByPointer: ReadonlyMap<string, string>;
  /** Whether the sidecar omits the `$ref`-target map (the fallback the header comment describes). */
  readonly omitsRefTargets: boolean;
  /** The fragment's declaration-ordered theta-side field names, when step 5 recorded one. */
  readonly fieldOrder: readonly string[] | undefined;
  /** Per-position union arms, in SUBS-1 source order. */
  readonly armsByPointer: ReadonlyMap<string, readonly SidecarUnionArm[]>;
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
  const armsByPointer = new Map<string, readonly SidecarUnionArm[]>();
  for (const position of sidecar.unionArms ?? []) {
    armsByPointer.set(position.pointer, position.arms);
  }
  const index: SidecarIndex = {
    wireToTheta,
    enumByPointer,
    refByPointer,
    omitsRefTargets: sidecar.refTargets === undefined,
    fieldOrder: sidecar.fieldOrder,
    armsByPointer,
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
 * `buildObjectSchemaValue` (`value.ts`), even though this walk now establishes
 * the same declaration order that function does. Two structural reasons. Its
 * record build is a plain `{}`, so a payload key spelled `__proto__` would be
 * swallowed by the inherited setter — undoing this module's null-prototype
 * record build; the inbound key space is payload-controlled, a constructor's is
 * not. And it orders by a RESOLVED DECLARATION (`SchemaFieldOrder`), while this
 * walk orders by the per-`$defs` field-order list, the only order available at
 * a `#root` or `__inline_<slug>` position, which names no declaration to
 * resolve. `rebuildInbound` is entered here at the empty pointer, where a plain
 * object rebuilds into a fresh record whenever `defName` resolves a sidecar —
 * and a name `walk.schemaNames` admits always does, both sets coming from one
 * derived plan — so the install lands on a record no earlier brand can occupy.
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
 * declaring-enum tag at each named-enum position, dispatches a `{"anyOf":[…]}`
 * position to the first arm that admits the value, and recurses through arrays
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
  const arms = index?.armsByPointer.get(pointer);
  if (arms !== undefined) {
    return rebuildUnderFirstAdmittingArm(value, arms, walk);
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

  // Null-prototype for the same class of hazard `collectTypeEnv`'s design
  // note (`../parser/type-layer-checks.ts:317`) states for a `NamedType`
  // reference: `thetaKey` below is a string this walk did not mint — a
  // payload's own key, or an author's rename-map target — so it may spell
  // an `Object.prototype` own property (`__proto__` among them) verbatim,
  // and a plain `{}` resolves that through the inherited `__proto__`
  // setter instead of minting an own key.
  //
  // No read in this module needs a matching own-key guard. The three
  // per-position lookups are `Map`s (`indexOf`, `:212`; `wireToTheta`
  // `:217`, `enumByPointer` `:221`, `refByPointer` `:225`), and a `Map`
  // key never collides with `Object.prototype`; the payload walk below is
  // `Object.entries`, own-enumerable only. Nothing in this file answers
  // through a prototype chain, so the construction half is the one no
  // read-side guard can supply: a write the inherited setter swallows
  // loses the field outright, leaving nothing for a later read to guard.
  // A lookup this walk adds later by an author- or payload-controlled key
  // uses `Object.hasOwn`, per `type-compat.ts:98-109` (`resolveNamed`).
  const result: { [k: string]: ThetaValue } = Object.create(null) as { [k: string]: ThetaValue };
  // `orderedEntries` reorders; it never changes WHICH entries are visited or
  // how many — the walk below still guards `Object.hasOwn`-equivalent access
  // through plain `Object.entries` iteration, so bug 0173's own-key discipline
  // is unaffected by the reorder.
  for (const [wireKey, fieldValue] of orderedEntries(value, index)) {
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
 * Translate a value at a `{"anyOf":[…]}` position under the FIRST arm that
 * admits it (runtime-value-model.md §"Wire-name translation", the inbound
 * bullet's union clause).
 *
 * The arms are re-tested in SUBS-1 source order through the caller's own
 * validator seam, so two arms that both admit a value are settled by arm order
 * and the earlier arm governs. No arm admitting leaves the value exactly as it
 * arrived — the case an in-process callee's already-tagged value takes, since
 * the enum carrier is a boxed `String` that AJV's `type: "string"` test
 * refuses.
 *
 * The descent can only ADD. Where the chosen arm names a `$defs` entry the walk
 * re-enters it at that entry's own root, which rebuilds the record and installs
 * whatever tag or brand that entry describes; where the arm names an entry that
 * is NOT a declared `schema` — a minted inline-object or array key — the
 * rebuild would leave a value that arrived branded with none, so the incoming
 * brand is re-installed. That keeps the property
 * `tests/wire-translation-inbound-retag.test.ts` pins for a plan-undescribed
 * position: a rebuild at a position the plan has nothing to say about could
 * only subtract, and this one does not.
 */
function rebuildUnderFirstAdmittingArm(
  value: unknown,
  arms: readonly SidecarUnionArm[],
  walk: InboundWalk,
): ThetaValue {
  const arm = firstAdmittingArm(value, arms, walk);
  if (arm === undefined) {
    return value as ThetaValue;
  }
  if (arm.enumName !== undefined) {
    return typeof value === "string" ? makeEnumValue(arm.enumName, value) : (value as ThetaValue);
  }
  if (arm.defName === undefined) {
    return value as ThetaValue;
  }
  const priorTag = schemaTagOf(value as ThetaValue);
  const rebuilt = rebuildUnder(value, arm.defName, walk);
  if (
    priorTag !== undefined &&
    isPlainObject(rebuilt) &&
    schemaTagOf(rebuilt as ThetaValue) === undefined
  ) {
    brandSchemaValue(rebuilt as { [key: string]: ThetaValue }, priorTag);
  }
  return rebuilt;
}

/**
 * The first arm admitting `value`, in SUBS-1 source order, or `undefined` when
 * none does (or when no validator was supplied, which disables the dispatch).
 *
 * The arm document is compiled through the caller's own `SchemaValidator` —
 * the content-addressed compiled-validator cache of `../seams/schema-validator`
 * — so an arm shared across positions, elements or calls compiles once.
 *
 * The value is re-tested AS IT ARRIVED, which at the `invoke` return boundary
 * is NOT what that boundary's own AJV verdict read: there the verdict reads
 * {@link projectForValidation}'s wire projection while the re-test reads the
 * theta-side value. Aligning the re-test onto the projection would change
 * behaviour, and the asymmetry is what carries it: an in-process callee's enum
 * value is a boxed `String`, which every `type: "string"` arm refuses, so it
 * matches no arm and crosses by identity with the tag it already carries.
 * Re-testing the projection instead would strip that carrier to a bare string,
 * admit an arm, and rebuild a value the boundary never needed rebuilt.
 */
function firstAdmittingArm(
  value: unknown,
  arms: readonly SidecarUnionArm[],
  walk: InboundWalk,
): SidecarUnionArm | undefined {
  const validator = walk.schemaValidator;
  if (validator === undefined) {
    return undefined;
  }
  for (const arm of arms) {
    let compiled = walk.armValidators.get(arm);
    if (compiled === undefined) {
      compiled = validator.compile(arm.document as LoweredSchema);
      walk.armValidators.set(arm, compiled);
    }
    if (compiled.validate(value).ok) {
      return arm;
    }
  }
  return undefined;
}

/**
 * The fragment root's payload entries in the order the rebuilt record must
 * carry them: every field the sidecar's step-5 field-order list names, in
 * DECLARATION order, then every remaining payload entry in its existing
 * relative order.
 *
 * Reached only at the fragment root: the guard above this function's one call
 * site already returns for every `pointer !== ""` position (`rebuildInbound`'s
 * `sidecar === undefined || pointer !== ""` arm), so the fragment-root scoping
 * is structural and this function takes no `pointer` and adds no redundant
 * check of its own.
 *
 * `expressions.md` §"Built-in methods and properties" fixes `keys()` to
 * "schema declaration order for named schemas" and qualifies that clause only
 * by whether the schema is named — not by how the value was produced — so a
 * record rebuilt from a MODEL-ordered payload is inside it, exactly as a
 * constructor-built one is (bug 0080 established the same order at
 * construction). The order is established HERE, at the rebuild, and nowhere on
 * the read path: `evaluateObjectMember` returns the record's own key order
 * verbatim.
 *
 * The reorder is key-set preserving on the terms `buildObjectSchemaValue`
 * already is: `Object.entries` is own-enumerable only, every entry is emitted
 * exactly once, and a declared name the payload does not carry is never
 * invented. Where the sidecar names no order — a synthesised sidecar, a
 * permissive root, a `$defs` entry with no object body — payload order is
 * preserved unchanged.
 *
 * The declaration lookup keys on the THETA-side name, because that is the key
 * the rebuilt record carries: the rename is applied to this same entry list
 * one layer up, and step 5's field-order list is theta-side by construction.
 */
function orderedEntries(
  value: { readonly [k: string]: unknown },
  index: SidecarIndex | undefined,
): readonly (readonly [string, unknown])[] {
  const entries = Object.entries(value);
  const fieldOrder = index?.fieldOrder;
  if (fieldOrder === undefined || entries.length < 2) {
    return entries;
  }
  // Payload positions bucketed by their theta-side key, so a declared name
  // consumes one entry per occurrence and a payload whose keys are unique (the
  // JSON case) resolves in one step.
  const positions = new Map<string, number[]>();
  entries.forEach(([wireKey], position) => {
    const thetaKey = index?.wireToTheta.get(wireKey) ?? wireKey;
    const bucket = positions.get(thetaKey);
    if (bucket === undefined) {
      positions.set(thetaKey, [position]);
    } else {
      bucket.push(position);
    }
  });
  const ordered: (readonly [string, unknown])[] = [];
  const taken = new Set<number>();
  for (const declared of fieldOrder) {
    const position = positions.get(declared)?.shift();
    if (position !== undefined) {
      taken.add(position);
      ordered.push(entries[position] as readonly [string, unknown]);
    }
  }
  entries.forEach((entry, position) => {
    if (!taken.has(position)) {
      ordered.push(entry);
    }
  });
  return ordered;
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

  // Same rule as `rebuildInbound`'s record: `wireKey` below is a wire name
  // the schema author chose, and `schemas.md:30` admits an arbitrary JSON
  // property name there, so this key space is author-controlled without
  // restriction and may spell `__proto__` too.
  const result: { [k: string]: unknown } = Object.create(null) as { [k: string]: unknown };
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const wireKey = thetaToWire.get(thetaKey) ?? thetaKey;
    result[wireKey] = lowerOutbound(fieldValue as ThetaValue, sidecars.get(wireKey), sidecars);
  }
  return result;
}

/**
 * Project a value to the shape the `invoke<T>` return-value AJV gate reads
 * structurally, for that `validate` call only. The caller of this function
 * hands the ORIGINAL value downstream unchanged on every path; this
 * projection is disposable and never itself crosses the invoke boundary.
 *
 * AJV's `type: "string"` check is a `typeof` test, and the enum carrier
 * {@link makeEnumValue} builds is a boxed `String` (`typeof === "object"`).
 * This walk collapses exactly that gap — one boxed value, one level of
 * array, one level of plain-object field, recursively — and nothing else.
 *
 * Not {@link translateOutbound}: it renames nothing. The value at the
 * `invoke<T>` return boundary is the callee's own theta-side value, and the
 * lowered document that boundary validates against already emits
 * theta-side property names (`inbound-boundary.ts:68`'s doc-comment states
 * the same fact for the inbound direction), so a rename here would corrupt
 * an already-correct key. It also does not call {@link lowerOutbound}: that
 * walk always rebuilds its record and renames by sidecar — a materially
 * different job from this one's copy-on-change, rename-free walk, and
 * threading a "skip the rename" flag through a shared walk would leave both
 * jobs harder to read than two short functions.
 *
 * Copy-on-change — returning the SAME array/object reference whenever no
 * descendant needed collapsing — is load-bearing, not an optimisation: it
 * keeps "a payload with no named-enum value anywhere reaches the AJV seam
 * unchanged" structurally true rather than incidentally true (GOV-15,
 * docs/spec_topics/governance/source-language-stability.md:5).
 */
export function projectForValidation(value: ThetaValue): unknown {
  if (value instanceof String) {
    // The boxed enum carrier's wire form is its bare string — the same
    // collapse `lowerOutbound` performs for the outbound direction (`:578`).
    return value.valueOf();
  }
  if (Array.isArray(value)) {
    let changed = false;
    const projected = value.map((element) => {
      const next = projectForValidation(element);
      if (next !== element) {
        changed = true;
      }
      return next;
    });
    return changed ? projected : value;
  }
  if (isResultValue(value)) {
    // `Result` is not a lowerable type form (schema-subset.md §"Lowering
    // Algorithm" step 3), so no position a `returnSchema` describes can hold
    // one; descending would differ from the gate above only at positions AJV
    // places no constraint on, and this projection exists solely for AJV's
    // eyes. Mirrors `rebuildInbound`'s own `isResultValue` arm (`:320`).
    return value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  let changed = false;
  const projected: { [k: string]: unknown } = Object.create(null) as { [k: string]: unknown };
  for (const [key, fieldValue] of Object.entries(value)) {
    const next = projectForValidation(fieldValue as ThetaValue);
    if (next !== fieldValue) {
      changed = true;
    }
    projected[key] = next;
  }
  return changed ? projected : value;
}
