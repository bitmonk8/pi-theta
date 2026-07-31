// V6b / V6b-T — the `params:` contract seam.
//
// This module owns the `params:` field contract of
// frontmatter/frontmatter-fields-a.md §params and §Defaults: the type-expression
// RHS (with whole-file forward references to body `schema`/`enum` declarations),
// the literal-sublanguage defaults, the no-non-defaulted-after-defaulted
// ordering rule, and the lowering of `params:` to a single AJV-validatable
// JSON-Schema document.
//
// The five behaviour-bearing checks this seam owns:
//
//   - `theta/parse/non-trailing-default` — a non-defaulted param placed after a
//     defaulted param in declaration order; the diagnostic names the first
//     offending non-defaulted field.
//   - `theta/parse/default-not-literal` — a default RHS outside the theta literal
//     sublanguage; delegated to the `V2a` literal-sublanguage check, whose
//     diagnostic names the offending sub-expression.
//   - `theta/parse/unresolved-named-type` — a `params:` RHS `NamedType` that
//     resolves to no body `schema`/`enum` declaration or imported `.thetalib`
//     symbol. Resolution is whole-file, so a frontmatter-to-body forward
//     reference is not itself a failure.
//   - `theta/load/schema-slug-collision` — an `__inline_<slug>` slug match
//     whose retained canonical-form bytes differ (schema-subset.md
//     §Schema-slug collision posture); raised at the field being lowered
//     when the byte check failed.
//   - the lowered schema — the per-theta `params:` object document, validated
//     through AJV (the `V8c` `SchemaValidator` seam) at invocation time.
//
// V6b-T (tests-task) declares these seam shapes and stubs `parseParams` as an
// inert pass (no diagnostics, no lowered schema) so the failing tests compile
// and red on their own primary assertions (the `params:` contract is absent).
// The paired V6b implementation leaf fills it in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type LoweredSchema } from "../seams/schema-validator";
import { checkLiteralSublanguage } from "./literal-sublanguage";
import {
  canonicalForm,
  lowerUnion,
  schemaSlug,
  type LoweredJsonValue,
  type LoweredObjectEntry,
  type LoweredPrimitiveType,
  type LoweredUnionArm,
} from "./schema-lowering";

/**
 * One `params:` field as written in source, in declaration order.
 *
 *   - `name`          — the param's theta-side identifier.
 *   - `typeSource`    — the right-hand-side type expression verbatim, parsed by
 *                       the theta type grammar (a primitive, a generic, or a
 *                       `NamedType` resolved whole-file against `bodyTypes`).
 *   - `defaultSource` — the default RHS verbatim, present iff the field carries
 *                       a `= <literal>` default; checked against the theta
 *                       literal sublanguage.
 *   - `range`         — the field's located site, for diagnostics.
 */
export interface ParamFieldInput {
  readonly name: string;
  readonly typeSource: string;
  readonly defaultSource?: string;
  readonly range: SourceRange;
}

/**
 * A body-level named type the `params:` RHS may resolve against — a `schema` or
 * `enum` declaration, or a symbol imported from a `.thetalib` module. Resolution is
 * whole-file, so the declaration order relative to the frontmatter does not
 * matter; a forward reference resolves identically to a backward one.
 *
 * `lowered` is the JSON-Schema fragment the named type contributes as a `$defs`
 * entry, so a resolved `NamedType` lowers to a `{ "$ref": "#/$defs/<name>" }`
 * against it.
 */
export interface BodyTypeDeclaration {
  readonly name: string;
  readonly lowered: Record<string, unknown>;
}

/** A located site for a `params:` parse. */
export interface ParamsParseSite {
  readonly file: string;
}

/**
 * The outcome of parsing a `params:` block: every diagnostic raised in source
 * order, plus the lowered AJV-validatable schema document — present iff the
 * block lowered cleanly (no `theta/parse/unresolved-named-type`, no ordering or
 * default-literal error), absent otherwise.
 */
export interface ParamsParseResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly loweredSchema?: LoweredSchema;
}

/**
 * Parse a `params:` block against the field contract of
 * frontmatter/frontmatter-fields-a.md §params and §Defaults, returning every
 * diagnostic raised (in source order) and the lowered AJV-validatable schema:
 *
 *   - `theta/parse/non-trailing-default` — a non-defaulted field after a
 *     defaulted field (the diagnostic names the first offending field);
 *   - `theta/parse/default-not-literal` — a default RHS outside the literal
 *     sublanguage (the diagnostic names the offending sub-expression);
 *   - `theta/parse/unresolved-named-type` — a RHS `NamedType` resolving to no
 *     `bodyTypes` entry (whole-file resolution, so forward references resolve);
 *   - `loweredSchema` — the per-theta object schema (non-defaulted fields
 *     `required`, named types lowered to in-document `$ref`s against a `$defs`
 *     table holding the transitive closure — see `hoistNestedDefs`),
 *     validated through the `V8c` AJV `SchemaValidator` at invocation time.
 *
 * V6b-T stubs this as an inert pass (no diagnostics, no lowered schema); the
 * paired V6b implementation leaf computes the ordering check, the default-literal
 * delegation, the whole-file named-type resolution, and the lowering.
 */
export function parseParams(
  fields: readonly ParamFieldInput[],
  bodyTypes: readonly BodyTypeDeclaration[],
  site: ParamsParseSite,
): ParamsParseResult {
  const diagnostics: Diagnostic[] = [];

  // Whole-file named-type resolution: the `params:` RHS resolves against every
  // body declaration regardless of source order, so a frontmatter-to-body
  // forward reference resolves identically to a backward one.
  const bodyTypeMap = new Map<string, Record<string, unknown>>(
    bodyTypes.map((decl) => [decl.name, decl.lowered] as const),
  );

  // Lower each field's type RHS, collecting the resolved `$defs` and any
  // unresolved `NamedType` names in source order.
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const defs: Record<string, Record<string, unknown>> = {};
  // The `__inline_<slug>` dedup table is BLOCK-shared (it is `defs` itself), so
  // its retained canonical bytes and its collision sink are block-shared too:
  // schema-subset.md §Schema-slug collision posture mandates the byte-equality
  // check on every slug match across the whole lowering pass, not per field.
  const inlineCanonical = new Map<string, string>();
  const slugCollisions: string[] = [];
  const collisionSites: { readonly slug: string; readonly range: SourceRange }[] = [];
  for (const field of fields) {
    const lowerCtx: LowerCtx = {
      bodyTypeMap,
      defs,
      unresolved: [],
      inlineCanonical,
      slugCollisions,
    };
    properties[field.name] = lowerParamsFieldType(field.typeSource, lowerCtx);
    // The sink is append-only and shared, so every slug appended during THIS
    // field's lowering is attributable to THIS field's range — which is the
    // range the collision diagnostic must carry, the site being lowered when the
    // check failed.
    for (const slug of slugCollisions.slice(collisionSites.length)) {
      collisionSites.push({ slug, range: field.range });
    }
    for (const name of lowerCtx.unresolved) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/unresolved-named-type",
        file: site.file,
        range: field.range,
        message: `unresolved named type '${name}'`,
      });
    }
    if (field.defaultSource === undefined) {
      required.push(field.name);
    }
  }

  // A slug match whose retained canonical bytes DIFFER is a schema-slug
  // collision: `lowerParamsFieldType` has already refused to merge the two
  // fragments, and this is the registered load-time report of that refusal. The
  // error severity withholds the lowered schema below, which is the registry
  // row's "The file is not registered" posture (code-registry-load.md).
  for (const collision of collisionSites) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/schema-slug-collision",
      file: site.file,
      range: collision.range,
      message: `schema-slug collision on slug ${collision.slug}: two distinct inline schemas hash alike`,
    });
  }

  // No non-defaulted field may follow a defaulted field in declaration order;
  // the diagnostic names the FIRST offending non-defaulted field. Fired once.
  let seenDefault = false;
  for (const field of fields) {
    if (field.defaultSource !== undefined) {
      seenDefault = true;
      continue;
    }
    if (seenDefault) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/non-trailing-default",
        file: site.file,
        range: field.range,
        message: `non-defaulted param '${field.name}' follows a defaulted param; defaulted params must be trailing`,
      });
      break;
    }
  }

  // Each default RHS must be a Theta literal-sublanguage form; the is-literal
  // check (V2a) names the offending sub-expression in its diagnostic.
  for (const field of fields) {
    if (field.defaultSource === undefined) {
      continue;
    }
    diagnostics.push(
      ...checkLiteralSublanguage(field.defaultSource, "default", {
        file: site.file,
        range: field.range,
      }),
    );
  }

  // The block lowers to an AJV-validatable document only when it lowered
  // cleanly: an unresolved named type, an ordering error, or a non-literal
  // default leaves the lowered schema absent.
  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) {
    return { diagnostics };
  }

  const loweredSchema: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  const hoistedDefs = hoistNestedDefs(defs);
  if (Object.keys(hoistedDefs).length > 0) {
    loweredSchema["$defs"] = hoistedDefs;
  }
  return { diagnostics, loweredSchema: loweredSchema as LoweredSchema };
}

/**
 * Lift every nested `$defs` entry a registered fragment carries up to the
 * `params:` document's OWN top level, stripping the nested copy on the way.
 *
 * WHY: `lowerTypeExpr` mints ROOT-ABSOLUTE `{ "$ref": "#/$defs/<name>" }`
 * pointers, which JSON Schema resolves against the document root and nowhere
 * else, but it registers only the names a `params:` field references DIRECTLY.
 * A name reached only THROUGH another name — `params: { p: Person }` where
 * `Person.pets: array<Animal>` — arrives inside `Person`'s own fragment-local
 * `$defs`, at `#/$defs/Person/$defs/Animal`, which no pointer can name: AJV
 * refuses the whole document with `can't resolve reference #/$defs/Animal`
 * when the binder compiles the envelope it is hoisted into
 * (binder-envelope.ts lifts this `$defs` verbatim to the envelope root). The
 * annotation path performs the same lift (`pruneDocumentDefs`,
 * query-schema-lowering.ts); this is the `params:` sibling of it, minus the
 * reachability prune (a `params:` fragment is registered only when a ref to
 * it is minted, so every hoisted name is reachable by construction).
 *
 * The queue walk is keyed by def NAME with first-wins dedup, and that name set
 * doubles as the cycle/termination guard: a self- or mutually-recursive schema
 * closure names itself, so re-queuing the same name must terminate rather than
 * recurse forever. Fragments are never mutated — a hoisted-from body sheds its
 * `$defs` through a shallow clone, because the same fragment object is aliased
 * at several positions in one document (the body-type map's own entry and
 * every closure carrying it).
 */
function hoistNestedDefs(
  defs: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defs);
  while (queue.length > 0) {
    const [name, body] = queue.shift() as [string, Record<string, unknown>];
    if (hoisted[name] !== undefined) {
      continue;
    }
    const nested = body["$defs"];
    if (nested === undefined || nested === null || typeof nested !== "object") {
      hoisted[name] = body;
      continue;
    }
    queue.push(...Object.entries(nested as Record<string, Record<string, unknown>>));
    const stripped: Record<string, unknown> = { ...body };
    delete stripped["$defs"];
    hoisted[name] = stripped;
  }
  return hoisted;
}

/** The lowering context threaded through a single field's type expression. */
export interface LowerCtx {
  readonly bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>;
  /** Resolved named types, collected as `$defs` entries (shared across fields). */
  readonly defs: Record<string, Record<string, unknown>>;
  /** `NamedType` names this field references that resolve to no declaration. */
  readonly unresolved: string[];
  /**
   * The canonical-form bytes of each `__inline_<slug>` fragment already minted
   * into `defs`, keyed by the bare 16-hex slug. schema-subset.md §Schema-slug
   * collision posture requires a slug-keyed dedup table to store the bytes
   * ALONGSIDE the keyed artefact, so a slug match is settled by a byte
   * comparison rather than a re-serialisation.
   *
   * OPTIONAL because only the `params:` field position mints `__inline_` entries
   * (`lowerParamsFieldType`): the body-type and query-lowering call sites thread
   * no map and perform no check, and adding the field must not force them to.
   */
  readonly inlineCanonical?: Map<string, string>;
  /**
   * Sink for the bare slugs whose byte-equality check FAILED, appended in
   * lowering order. Like `unresolved`, the caller owns the array's lifetime and
   * this module never reads it back: `parseParams` turns each entry into
   * `theta/load/schema-slug-collision` at the field it was lowering. Absent, the
   * check has nowhere to report and the retention is still first-wins.
   */
  readonly slugCollisions?: string[];
}

const PRIMITIVE_TYPES = new Set<LoweredPrimitiveType>([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Lower a single `params:` type expression to its JSON-Schema fragment,
 * resolving every `NamedType` whole-file against `lowerCtx.bodyTypeMap`:
 *
 *   - a primitive (`string`/`number`/`integer`/`boolean`/`null`) lowers to
 *     `{ "type": <name> }`;
 *   - `array<T>` lowers to `{ "type": "array", "items": <lowered T> }`;
 *   - a union `A | B` lowers per SUBS-1 (`{ "type": [...] }` all-primitive, else
 *     `{ "anyOf": [...] }`);
 *   - an identifier-shaped `NamedType` resolves against the body declarations,
 *     lowering to an in-document `{ "$ref": "#/$defs/<name>" }` (and registering
 *     the resolved fragment under `$defs`), or — when it resolves to no
 *     declaration — records the name for the `theta/parse/unresolved-named-type`
 *     diagnostic and lowers permissively.
 *
 * Literal-type and inline-object lowering beyond this subset is owned by the
 * schema-subset lowering leaves, not this seam; an unrecognised form lowers
 * permissively (`{}`) while still resolving any `NamedType` it nests.
 *
 * A `params:` field's own right-hand side never reaches this function
 * brace-rooted: `lowerParamsFieldType` (below) intercepts that shape first and
 * hoists it, calling this function only for what is left over (bug 0035). A
 * brace-rooted type nested inside a generic argument or a union arm still
 * arrives here unintercepted, so this function's own handling of that shape —
 * the trailing catch-all — is unchanged.
 */
export function lowerTypeExpr(source: string, lowerCtx: LowerCtx): Record<string, unknown> {
  const s = source.trim();

  // Generic application: `ctor<args>`.
  const lt = s.indexOf("<");
  if (lt > 0 && s.endsWith(">")) {
    const ctor = s.slice(0, lt).trim();
    const args = splitTopLevel(s.slice(lt + 1, s.length - 1), ",");
    if (ctor === "array" && args.length === 1) {
      const first = args[0] ?? "";
      return { type: "array", items: lowerTypeExpr(first, lowerCtx) };
    }
    // Any other generic (e.g. `Result<T, E>`, which has no lowered-schema form):
    // resolve nested named types best-effort, lower permissively.
    for (const arg of args) {
      lowerTypeExpr(arg, lowerCtx);
    }
    return {};
  }

  // Union: lower each arm and combine per SUBS-1.
  const arms = splitTopLevel(s, "|");
  if (arms.length > 1) {
    const loweredArms: LoweredUnionArm[] = arms.map((arm) => {
      const lowered = lowerTypeExpr(arm, lowerCtx);
      const type = lowered["type"];
      if (
        Object.keys(lowered).length === 1 &&
        typeof type === "string" &&
        PRIMITIVE_TYPES.has(type as LoweredPrimitiveType)
      ) {
        return { kind: "primitive", type: type as LoweredPrimitiveType };
      }
      return { kind: "non-primitive", lowered };
    });
    return { ...lowerUnion(loweredArms) };
  }

  // Atom.
  if (PRIMITIVE_TYPES.has(s as LoweredPrimitiveType)) {
    return { type: s };
  }
  if (IDENTIFIER.test(s)) {
    // An identifier-shaped atom is a `NamedType`: resolve whole-file.
    const resolved = lowerCtx.bodyTypeMap.get(s);
    if (resolved === undefined) {
      lowerCtx.unresolved.push(s);
      return {};
    }
    lowerCtx.defs[s] = resolved;
    return { $ref: `#/$defs/${s}` };
  }
  // A literal-type atom (string/number literal) or any other form: lower
  // permissively; literal lowering is owned by the schema-subset leaves.
  return {};
}

/**
 * Lower a single `params:` field's type expression, intercepting a
 * brace-rooted inline object type (`{a: Triage, b: integer}`) before it can
 * reach `lowerTypeExpr`'s catch-all: `parseParams`'s per-field loop calls this
 * instead of `lowerTypeExpr` directly (bug 0035), so a name inside the object
 * resolves through the same `lowerCtx` — landing in `lowerCtx.unresolved` for
 * the caller's diagnostic loop, or in `lowerCtx.defs` as a hoisted `$ref`
 * target — exactly as the `@<T>` annotation and `schema`-body positions
 * already do (schema-subset.md:73/:76).
 *
 * THE INTERIOR SPLIT NESTS BRACE DEPTH. The interior of a brace-rooted `params:`
 * field is an inline-object FIELD LIST whose per-field `Type` is recursive
 * (grammar.md:109), so a nested `ObjectType` is ONE field's type and the comma
 * inside it is not an outer separator — hence `"angle-and-brace"`. Splitting on
 * angle depth alone reads `{a: Triage, b: {x: integer, y: string}}` as the three
 * entries `a: Triage`, `b: {x: integer`, `y: string}`: the theta loads clean and
 * mints a fragment carrying a permissive `b`, a PHANTOM top-level `y`, and a
 * three-name `required`, so AJV then rejects the author's own payload and
 * accepts the phantom shape instead. `topLevelColon` needs no change and is
 * shared with `lowerInlineObject` as-is — it already tracks brace depth, so a
 * nested object's own `:` never splits the enclosing entry.
 *
 * That is a DELIBERATE divergence from `lowerInlineObject`
 * (body-type-lowering.ts), whose interior split is angle-only and which
 * therefore drops those same two fragments at the three sibling positions. Their
 * behaviour on nested-comma texts is theirs — pre-existing, recorded as a
 * residual, not changed from here. What an author moving a type expression
 * between positions relies on is the SINGLE-LEVEL raise-parity, and that is
 * unchanged: all four positions name `Tirage` in `{a: Tirage, b: integer}`.
 *
 * A zero-field body — `{}`, or an interior of only whitespace — returns the
 * permissive `{}` with no hoist and no diagnostic. grammar.md:109's
 * empty-schema-body case stays open for the `params:` position (bug 0035
 * §Expected leaves it out of scope); this arm must not pre-empt it.
 *
 * Each field's own type recurses through this same function, so a nested
 * brace-rooted type hoists its own `__inline_<slug>` entry (the MIXED
 * fixture); the recursion falls through to `lowerTypeExpr` the moment a
 * field's type is not itself brace-rooted.
 */
export function lowerParamsFieldType(
  source: string,
  lowerCtx: LowerCtx,
): Record<string, unknown> {
  const s = source.trim();
  if (!(s.startsWith("{") && s.endsWith("}"))) {
    return lowerTypeExpr(s, lowerCtx);
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const entry of splitTopLevel(s.slice(1, -1), ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const fieldName = entry.slice(0, colon).trim();
    const fieldType = entry.slice(colon + 1).trim();
    if (fieldName.length === 0 || fieldType.length === 0) {
      continue;
    }
    properties[fieldName] = lowerParamsFieldType(fieldType, lowerCtx);
    required.push(fieldName);
  }
  if (required.length === 0) {
    return {};
  }

  const fragment: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  // Content-addressed, so two fields declaring inline types that LOWER ALIKE
  // share one `$defs` entry. The slug is a 64-bit truncation of SHA-256, so a
  // slug match is only evidence of fragment identity until the bytes are
  // compared: schema-subset.md §Schema-slug collision posture mandates that
  // comparison on every `__inline_<slug>` match and requires the bytes to be
  // RETAINED beside the entry, so the check is a byte comparison rather than a
  // re-serialisation. `canonicalForm` is called here rather than the bytes being
  // reconstructed from `schemaSlug`'s internals, which keeps the hash recipe
  // (§Canonical schema hash steps 2–4) owned by schema-lowering.ts.
  const lowered = toLoweredJsonValue(fragment);
  const canonical = canonicalForm(lowered);
  const slug = schemaSlug(lowered);
  const defName = `__inline_${slug}`;
  if (lowerCtx.defs[defName] !== undefined) {
    const retained = lowerCtx.inlineCanonical?.get(slug);
    if (retained !== undefined && retained !== canonical) {
      // Differing bytes: refuse to merge and report the slug. The caller raises
      // the registered `theta/load/schema-slug-collision`, whose message literal
      // is held identical to `dedupInlineSchemas`'s (schema-lowering.ts) by
      // DIAG-4 rather than by shared code — that function applies the same
      // posture to a post-hoc fragment LIST and has no production caller today,
      // while this site needs the decision AT MINT TIME because the `$ref` it
      // returns must name whichever fragment is retained.
      lowerCtx.slugCollisions?.push(slug);
    }
    // FIRST WINS either way — the retention posture `dedupInlineSchemas` applies:
    // byte-equal fragments are the silent dedup case (schema-subset.md step 2),
    // and a colliding one must not displace the fragment an earlier field's
    // `$ref` already names. An entry carrying no retained bytes has nothing to
    // compare and is retained too — the reachable input class there is an
    // author-declared schema whose name is literally `__inline_<16hex>` and
    // matches a minted slug: a namespace clash outside the registry row's
    // anonymous-inline trigger, retained silently pending a spec decision on
    // reserving the prefix.
    return { $ref: `#/$defs/${defName}` };
  }
  lowerCtx.defs[defName] = fragment;
  lowerCtx.inlineCanonical?.set(slug, canonical);
  return { $ref: `#/$defs/${defName}` };
}

/**
 * Convert a lowered-schema JSON value (as `lowerParamsFieldType` builds it —
 * nested objects, arrays, strings, booleans) to the `LoweredJsonValue` the
 * canonical-hash recipe (`schemaSlug`) requires. Total over that domain: an
 * integer-valued number renders `"integer"`, any other number `"number"` — no
 * numeric consts arise from a `params:` inline object today, since a field
 * type routes through `lowerTypeExpr`, never the literal-sublanguage lowering,
 * but the slug recipe is number-kind-sensitive, so this conversion does not
 * assume only the shapes reachable so far. Object entries are walked in
 * insertion order; `canonicalForm` sorts them by Unicode code point before
 * hashing.
 */
function toLoweredJsonValue(value: unknown): LoweredJsonValue {
  if (typeof value === "string") {
    return { kind: "string", value };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { kind: "integer", value }
      : { kind: "number", value };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (Array.isArray(value)) {
    return { kind: "array", items: value.map(toLoweredJsonValue) };
  }
  const entries: LoweredObjectEntry[] = Object.entries(
    value as Record<string, unknown>,
  ).map(([key, entryValue]) => ({ key, value: toLoweredJsonValue(entryValue) }));
  return { kind: "object", entries };
}

/** Find the top-level `:` in a `field: Type` entry, respecting `<>`/`{}` nesting. */
export function topLevelColon(entry: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < entry.length; i += 1) {
    const c = entry[i] ?? "";
    if (quote !== undefined) {
      if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "<" || c === "{" || c === "(") {
      depth += 1;
    } else if (c === ">" || c === "}" || c === ")") {
      depth -= 1;
    } else if (c === ":" && depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Which bracket pairs `splitTopLevel` counts as nesting.
 *
 *   - `"angle"` — `<…>` alone. The union-arm splits and `lowerTypeExpr`'s own
 *     GENERIC ARGUMENT split use this, and widening either would change which
 *     fragments they lower: `array<{a: string, b: integer}>` would present as one
 *     argument and take the `array` arm, emitting a fragment that asserts
 *     arrayness while dropping the element shape, and `{a: 1 | 2}` would stop
 *     splitting into arms at all.
 *   - `"angle-and-brace"` — `<…>` and `{…}`. This is what the `Type` grammar
 *     requires wherever a comma separates items whose own `Type` may be an
 *     `ObjectType`: grammar.md §"Type grammar" makes `ObjectType` a `Type` and
 *     §"Inline object types" admits it "in any `Type` position", recursively.
 *     Two lists need it. A `GenericType` ARGUMENT list —
 *     `Result<{a: string, b: integer}, QueryError>` has exactly two arguments and
 *     its first carries a comma, so an angle-only split yields three parts and
 *     disagrees with the parser that computes
 *     `theta/parse/generic-arity-mismatch`. And the inline-object FIELD LIST of a
 *     brace-rooted `params:` field (`lowerParamsFieldType`), where a nested
 *     `ObjectType` is a single field's type; that function's comment records what
 *     an angle-only split mints there, and why `lowerInlineObject`
 *     (body-type-lowering.ts) keeping the angle-only split is a residual rather
 *     than a shared rule.
 */
export type TypeSplitNesting = "angle" | "angle-and-brace";

/**
 * Split a type expression on a top-level `separator`, respecting `nesting`
 * bracket depth and `"`/`'` string literals so nested generics, inline object
 * types and literal arms are not split mid-token. Empty segments are dropped.
 */
export function splitTopLevel(
  source: string,
  separator: string,
  nesting: TypeSplitNesting = "angle",
): string[] {
  const parts: string[] = [];
  const tracksBraces = nesting === "angle-and-brace";
  let depth = 0;
  let quote: string | undefined;
  let current = "";
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i] ?? "";
    if (quote !== undefined) {
      current += c;
      if (c === "\\" && i + 1 < source.length) {
        current += source[i + 1] ?? "";
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    if (c === "<" || (tracksBraces && c === "{")) {
      depth += 1;
      current += c;
      continue;
    }
    if (c === ">" || (tracksBraces && c === "}")) {
      depth -= 1;
      current += c;
      continue;
    }
    if (depth === 0 && c === separator) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      current = "";
      continue;
    }
    current += c;
  }
  const tail = current.trim();
  if (tail.length > 0) {
    parts.push(tail);
  }
  return parts;
}
