// Shared body-type lowering — the single canonical place that lowers a theta
// body's `schema` / `enum` declarations to their JSON-Schema fragments. Used by
// two whole-file `NamedType` resolvers:
//
//   - the `params:` / typed-query response-schema lowering (via
//     `query-schema-lowering.ts`, which resolves a `@<Schema>` annotation to the
//     named decl's object body), and
//   - the frontmatter `params:` named-type resolution (via `collectBodyTypes`
//     in `theta-document.ts`, which supplies each body type's lowered fragment so
//     a `params:` field of a `NamedType` produces a present `loweredSchema`).
//
// Keeping the lowering here (rather than duplicated per caller) means an enum or
// named schema lowers identically wherever it is referenced.

import {
  hoistInlineObjectType,
  isSingleEnclosingBraceGroup,
  lowerBraceGroupUnionArms,
  lowerLiteralSublanguage,
  lowerTypeExpr,
  splitTopLevel,
  topLevelColon,
  type LowerCtx,
} from "./params";
import { defineRecordField } from "../runtime/value";
// The one-way import bug 0039 §Fix set — this module imports from
// `params.ts`, never the reverse — is what forces the shared brace predicate
// and the per-arm union dispatch to live beside `hoistInlineObjectType` in
// `params.ts` rather than here (bug 0097 §Fix, §Fix "Where the code lives").
// Re-exported so this module's own importers — `theta-document.ts`'s
// discriminator-field classifier and whole-file name walk,
// `query-schema-lowering.ts`'s annotation root, and the
// `tests/discriminator-field-classifier-brace-group.test.ts` witness — keep
// reaching the predicate at this same import path.
export { isSingleEnclosingBraceGroup };

/**
 * The three `LowerCtx` sinks an `__inline_<slug>` mint reads and writes
 * (schema-subset.md §Schema-slug collision posture, plus the cross-scope
 * fragment retention `LowerCtx.inlineFragments` documents), threaded as ONE
 * optional trailing parameter through the three RECURSIVE LOWERING functions
 * that take it: `lowerObjectFields`, `lowerInlineObject` and
 * `lowerTypeSource`, which call one another down a single type source and
 * therefore have to share one retention.
 *
 * The module's other two minting entry points do not take it, and each has
 * its own reason. `buildBodyTypeSchemas` is the document-scoped pass that OWNS
 * the sinks — it constructs them, threads them into those three, and exposes
 * only the outcome, through a `collisions` out-sink whose entries carry the
 * decl each failure is attributable to. `collectUnresolvedNamedTypes` mints
 * into a `defs` record it discards on the next line: it returns NAMES, never
 * bytes, so there is no `$defs` closure to keep consistent and nothing for a
 * retention to serve.
 *
 * Optional because a caller that mints no `__inline_` entry has nothing to
 * retain and no check to run (the three `LowerCtx` fields are themselves
 * optional for the same reason).
 */
export interface InlineHoistSinks {
  /** Canonical-form bytes of every minted fragment, keyed by the bare slug. */
  readonly inlineCanonical: Map<string, string>;
  /** The retained fragment behind each of those slugs, same key. */
  readonly inlineFragments: Map<string, Record<string, unknown>>;
  /** Bare slugs whose byte-equality check FAILED, in lowering order. */
  readonly slugCollisions: string[];
}

/** A lowerable object-body field: a field name and its verbatim type source. */
export interface LowerableField {
  readonly name: string;
  readonly typeSource: string;
  /**
   * The lowered field description (A1: a schema-FIELD `///` lowers into the
   * property's own `description` key). Absent when the field carries no doc
   * comment.
   */
  readonly description?: string;
}

/** A schema declaration reduced to what lowering needs. */
export interface LowerableSchema {
  readonly name: string;
  /**
   * The lowered schema-DECL description (A1: a `///` above `schema` lowers
   * into the emitted `$defs` fragment's own `description` key, on both the
   * object-body and alias/union forms). Absent when the declaration carries
   * no doc comment.
   */
  readonly description?: string;
  /** Object-body field sources; absent for the alias/union form and for the head-only form. */
  readonly fields?: readonly LowerableField[];
  /**
   * The alias/union right-hand side, one Type source per top-level `|`-
   * separated arm (bug 0033 §Fix); absent for the object form and for the
   * head-only form. Joined with `" | "` and handed whole to `lowerTypeSource`,
   * which re-splits on the same separator — the SUBS-1 literal-union/enum
   * handling, the union split, named→`$ref` registration, and `lowerUnion`
   * combination are therefore shared with every other union-lowering call
   * site rather than duplicated here.
   */
  readonly arms?: readonly string[];
}

/** An enum declaration reduced to what lowering needs. */
export interface LowerableEnum {
  readonly name: string;
  /** Declared variant names in source order. */
  readonly variants?: readonly string[];
  /** Explicit `= "wire"` values keyed by variant name; a variant absent here uses its name. */
  readonly variantValues?: Readonly<Record<string, string>>;
  /**
   * The lowered enum-DECL description (A1: a `///` above `enum` lowers into
   * the emitted flat fragment's own `description` key; a per-variant `///`
   * has no lowering target and never reaches this field). Absent when the
   * declaration carries no doc comment.
   */
  readonly description?: string;
}

/**
 * Lower an enum declaration to its JSON-Schema fragment: a string with the
 * declared wire values enumerated. Each variant's wire value is its explicit
 * `= "..."` value when declared, else the variant name verbatim (schemas.md
 * §Enum declarations — the name-is-wire default; matches the runtime
 * `buildVariantWireMap` mapping).
 */
export function lowerEnumToSchema(
  variants: readonly string[] | undefined,
  variantValues: Readonly<Record<string, string>> | undefined,
  description?: string,
): Record<string, unknown> {
  const values = (variants ?? []).map((name) => variantValues?.[name] ?? name);
  // A1: the wire shape stays flat regardless of per-variant `///` (those lower
  // nowhere); only the enum-DECL's OWN description, when present, appends —
  // last, so the flat `{type,enum}` shape a description-less enum already
  // pins reads as an unchanged prefix.
  return description !== undefined
    ? { type: "string", enum: values, description }
    : { type: "string", enum: values };
}

/**
 * Lower a list of object-body field sources to an object JSON Schema: every
 * field `required` (a declared schema field is mandatory) and
 * `additionalProperties: false` (an undeclared property is a validation
 * failure), matching the `params:` object-lowering shape.
 */
export function lowerObjectFields(
  fields: readonly LowerableField[],
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  unresolved?: string[],
  sinks?: InlineHoistSinks,
  reservedKeywords?: string[],
  unspellable?: string[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const defs: Record<string, Record<string, unknown>> = {};
  for (const field of fields) {
    // Compute the lowered node first so a described field can append its
    // `description` to the VALUE only — `defineRecordField`'s __proto__
    // discipline governs the field NAME, not what the name's value carries.
    const lowered = lowerTypeSource(
      field.typeSource,
      bodyTypeMap,
      defs,
      unresolved,
      sinks,
      reservedKeywords,
      unspellable,
    );
    // A declared field name is author-controlled; see `defineRecordField`'s
    // doc-comment for why the lowered node must be defined, not assigned.
    defineRecordField(
      properties,
      field.name,
      field.description !== undefined ? { ...lowered, description: field.description } : lowered,
    );
    required.push(field.name);
  }
  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
  if (Object.keys(defs).length > 0) {
    schema["$defs"] = defs;
  }
  return schema;
}

/**
 * Lower an inline object type's comma-separated `field: Type` body. The
 * interior split nests brace depth (bug 0039 §Fix part A —
 * `"angle-and-brace"`, not the angle-only default `splitTopLevel` otherwise
 * takes): a nested `ObjectType` is ONE field's own type (grammar.md:109), so a
 * comma inside it is not this list's separator. Splitting on angle depth alone
 * read `{a: integer, b: {x: integer, y: string}}` as the three entries
 * `a: integer`, `b: {x: integer`, `y: string}` — a phantom top-level `y` and a
 * duplicated `required` name whenever the phantom collides with a real field.
 * `topLevelColon` needs no change: it already tracks brace depth.
 */
export function lowerInlineObject(
  body: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  unresolved?: string[],
  sinks?: InlineHoistSinks,
  reservedKeywords?: string[],
  unspellable?: string[],
): Record<string, unknown> {
  const fields: LowerableField[] = [];
  for (const entry of splitTopLevel(body, ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const name = entry.slice(0, colon).trim();
    const typeSource = entry.slice(colon + 1).trim();
    if (name.length === 0 || typeSource.length === 0) {
      continue;
    }
    fields.push({ name, typeSource });
  }
  return lowerObjectFields(fields, bodyTypeMap, unresolved, sinks, reservedKeywords, unspellable);
}

/**
 * Lower a single type-expression source to its JSON-Schema fragment. A
 * string-literal union (`"a" | "b"`) lowers to `{ "type": "string", "enum":
 * [...] }` (schema-subset.md:80); a union whose arms are literals of any
 * other kind (numbers, `true`/`false`, `null`, or a mix) lowers to the bare
 * `enum` form per SUBS-3 (schema-subset.md:80, the anchor `#subs-3`), which
 * governs exactly that case; a single literal of any kind lowers to a
 * `const` (`:79`). A SINGLE ENCLOSING BRACE GROUP (an inline object type, at
 * any depth) hoists into `defs` under `__inline_<slug>` (bug 0039 §Fix part
 * B); a union CARRYING such a group as one of its arms lowers arm by arm
 * through `lowerBraceGroupUnionArms` (params.ts, bug 0097 §Fix) so that arm
 * can hoist too; and every other form — primitive, `array<T>`, named type,
 * brace-free union — delegates to the `params:` `lowerTypeExpr` machinery.
 *
 * The inline-object arm recurses each field's type through `lowerTypeSource`
 * itself (an inner helper closing over `sinks`), not through `lowerTypeExpr`:
 * this function checks the SHARED literal sublanguage
 * (`lowerLiteralSublanguage`, params.ts — also `lowerParamsFieldType`'s,
 * bug 0056 §Fix) before either dispatch below, so a field's type has to
 * re-enter HERE, where that check runs again, or a nested `"x" | "y"` would
 * lower `anyOf: [{}, {}]` instead of the `schema-subset.md:80` enum form (a
 * string-literal union is `LiteralType` arms, not the `PrimitiveType` arms
 * SUBS-1, `:81`, governs).
 *
 * THE SINGLE-GROUP CHECK AND `lowerBraceGroupUnionArms` ARE ASKED IN THAT
 * ORDER FOR READABILITY, NOT NECESSITY — `lowerParamsFieldType` (params.ts,
 * bug 0097 §Fix) now asks the identical predicate pair in the identical
 * order, so the two type-lowering entry points agree by construction rather
 * than by two independently-maintained copies. `lowerBraceGroupUnionArms`'s
 * own doc comment (params.ts) proves the two guards disjoint and states why a
 * union with no brace-group arm or a SHREDDED segment set — the angle-only
 * `|` split cut through a brace group — declines and is handed whole to
 * `lowerTypeExpr`, unchanged from what that function's own union split
 * already produces (bug 0043 §Fix retired the one case that split disagreed
 * on: a union whose last arm ends in `>`). Arm ORDER is source order, and the
 * SUBS-1 combination is `lowerUnion`'s, so an arm that is not an inline
 * object lowers through the same call `lowerTypeExpr`'s union branch would
 * have made on it.
 *
 * `unresolved`, when supplied, is a SINK (bug 0028 §Fix): every `NamedType`
 * name `lowerTypeExpr` cannot resolve against `bodyTypeMap` is appended to it.
 * The caller owns the array's lifetime — this function never reads it back —
 * so `lowerObjectFields` / `lowerInlineObject` thread the SAME array across
 * every field of one body and `collectUnresolvedNamedTypes` reads it after
 * the call returns. Omitted, the names are collected into a throwaway array
 * and discarded, which is the behaviour every OTHER caller relies on (the
 * lowering itself stays permissive regardless of `unresolved`).
 *
 * `unspellable`, when supplied, is `LowerCtx.unspellable` (params.ts, bug
 * 0059 §Fix) threaded the same append-only, caller-owned way as `unresolved`:
 * `collectUnresolvedNamedTypes` (below) passes it through to the two body
 * positions — a `schema` object-body field type and a `schema X = …`
 * alias/union arm — so their callers can decline and refuse text that reaches
 * `lowerTypeExpr`'s trailing catch-all, exactly as `parseParams` already does
 * for `params:` (bug 0061 §Fix). Omitted, the catch-all stays exactly as
 * permissive and silent as it always was — the posture `lowerQueryResponseSchema`
 * (query-schema-lowering.ts) relies on for the `@<T>` annotation, which
 * threads this parameter to neither call it makes.
 *
 * `sinks`, when supplied, carries the slug-collision posture's two sinks
 * through to the inline-object arm's mint (bug 0039 §Fix constraint: the
 * posture must be wired wherever an `__inline_` entry can now be minted, not
 * only at the `params:` position).
 */
export function lowerTypeSource(
  source: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  defs: Record<string, Record<string, unknown>>,
  unresolved?: string[],
  sinks?: InlineHoistSinks,
  reservedKeywords?: string[],
  unspellable?: string[],
): Record<string, unknown> {
  const s = source.trim();
  // `exactOptionalPropertyTypes` forbids an explicit `undefined` on
  // `LowerCtx`'s optional keys, so only spread them in when present.
  const ctx: LowerCtx = {
    bodyTypeMap,
    defs,
    unresolved: unresolved ?? [],
    ...(reservedKeywords !== undefined ? { reservedKeywords } : {}),
    ...(unspellable !== undefined ? { unspellable } : {}),
    ...(sinks !== undefined
      ? {
          inlineCanonical: sinks.inlineCanonical,
          inlineFragments: sinks.inlineFragments,
          slugCollisions: sinks.slugCollisions,
        }
      : {}),
  };

  // Shared with `lowerParamsFieldType` (params.ts, bug 0056 §Fix): one
  // recogniser and one emission, so this function's three callers and the
  // `params:` position agree on a literal source's bytes by construction.
  const literal = lowerLiteralSublanguage(s);
  if (literal !== undefined) {
    return literal;
  }

  // An inner helper, not `lowerTypeExpr`, so a nested field's own type routes
  // back through THIS function's literal check before anything else — without
  // that re-entry a nested `"x" | "y"` reaches `lowerTypeExpr`, which owns no
  // literal sublanguage, and lowers `anyOf: [{}, {}]` instead of
  // `schema-subset.md:80`'s enum form (bug 0039 §Fix).
  const lowerField = (fieldSource: string, fieldCtx: LowerCtx): Record<string, unknown> =>
    lowerTypeSource(
      fieldSource,
      fieldCtx.bodyTypeMap,
      fieldCtx.defs,
      fieldCtx.unresolved,
      sinks,
      fieldCtx.reservedKeywords,
      fieldCtx.unspellable,
    );

  // The two checks below are asked in this order for readability, not
  // necessity: `isSingleEnclosingBraceGroup(s)` and the arm guard
  // `lowerBraceGroupUnionArms` (params.ts) applies are provably disjoint (see
  // that function's own doc comment), so asking the containing case first
  // only leaves the arm call reasoning about sources that are not one brace
  // group — it does not change which branch a source ultimately takes.
  if (isSingleEnclosingBraceGroup(s)) {
    return hoistInlineObjectType(s, ctx, lowerField);
  }

  const armUnion = lowerBraceGroupUnionArms(s, ctx, lowerField);
  if (armUnion !== undefined) {
    return armUnion;
  }

  return lowerTypeExpr(s, ctx);
}

/**
 * One `theta/load/schema-slug-collision` occurrence from a single
 * `buildBodyTypeSchemas` pass, attributed to the schema decl being lowered
 * when the byte-equality check failed (bug 0039 §Fix constraint: the
 * slug-collision posture must be wired wherever an `__inline_` entry can now
 * be minted, not only at the `params:` position). `collectBodyTypes`
 * (theta-document.ts) turns each entry into the registered diagnostic, at the
 * named decl's own range.
 */
export interface SchemaSlugCollision {
  readonly slug: string;
  readonly schemaName: string;
}

/**
 * Build the whole-file name → lowered-fragment map for a theta body's `schema`
 * and `enum` declarations, in TWO passes over a shared, mutable `bodies` map
 * (bug 0028 §Fix) plus a third pass that attaches each name's flat transitive
 * `$defs` closure:
 *
 * PASS 1 seeds `bodies` with every top-level name BEFORE any body lowers: an
 * enum's fragment lowers fully (lowering order never affects an enum); a
 * schema WITH an object body OR alias/union arms (bug 0033 §Fix widened this
 * arm from object-only) gets a MUTABLE PLACEHOLDER object, set
 * UNCONDITIONALLY so a schema still wins a name collision against an enum —
 * this loop runs second, exactly as today. A schema decl carrying NEITHER an
 * object body NOR alias arms (the head-only / malformed form) seeds
 * nothing — its callers supply a permissive fallback, as today.
 *
 * PASS 2 lowers each schema's fields (object form) or right-hand side
 * (alias/union form, bug 0033 §Fix — one `lowerTypeSource` call over the arms
 * rejoined with `" | "`, which already implements the SUBS-1
 * literal-union/enum handling, the union split, named→`$ref` registration,
 * and `lowerUnion` combination) against the FULLY SEEDED map, in source
 * order, then REPLACES the placeholder's own keys with the computed ones —
 * clear-then-`Object.assign`, not a fresh `bodies.set` — so the placeholder's
 * OBJECT IDENTITY survives. That identity is what makes a forward, self, or
 * mutual reference resolve: `lowerTypeExpr`'s identifier atom (params.ts)
 * looks the name up in `bodies` while every body is lowering, not only the
 * ones lowered so far, so it finds the (possibly still-empty, but PRESENT)
 * placeholder and mints a `$ref` instead of taking the unresolved arm
 * (schemas.md §Recursion; schema-subset.md §Lowering Algorithm step 3).
 * `directRefs` records the names each body's fields name DIRECTLY, for pass 3
 * to turn into a transitive closure. `inlineBodies` records every entry a
 * field type's own hoist minted THIS PASS whose name is absent from `bodies`
 * (bug 0039 §Fix constraint 4): a `schema`/`enum` decl seeds `bodies` in pass
 * 1, but an `__inline_<slug>` name never does — `lowerTypeExpr`'s identifier
 * atom only registers a name it resolved IN `bodies` — so a field type whose
 * own hoist mints an inline fragment needs a SECOND table for pass 3's
 * closure lookup to find it; without it, a hoisted def minted at the
 * `schema`-body or alias-RHS position would drop out of the closure and leave
 * a dangling `$ref` AJV refuses with `MissingRefError`. `inlineBodies` is
 * never merged into `bodies` itself — doing so would make an `__inline_` name
 * resolvable as an author-written `NamedType`, which is bug 0040's open
 * subject, not this fix's.
 *
 * The slug-collision posture (schema-subset.md §Schema-slug collision
 * posture) is DOCUMENT-scoped across this whole pass — one retention table
 * and one `slugCollisions` list serve every decl's lowering — while each decl
 * lowers into a `defs` record of its OWN. Those two scopes DIFFER here, where
 * at `parseParams` they coincide (one block-shared retention over the one
 * block-shared `defs` it mints into). That difference is what the SECOND
 * retention map is for (`LowerCtx.inlineFragments`, params.ts): when a second
 * decl mints a slug the first already retained, `hoistInlineObjectType`
 * compares bytes, reports a mismatch to `slugCollisions`, and re-registers the
 * FIRST decl's fragment under this decl's `defs` so the `$ref` it emits still
 * closes. `inlineBodies` is first-wins for the same reason: pass 3 must serve
 * every `$ref` to that slug the one retained fragment. `collisions`, when
 * supplied, receives each
 * failure attributed to the decl being lowered when it happened, by the same
 * append-and-slice pattern `parseParams` applies per field.
 *
 * PASS 3 attaches a FLAT TRANSITIVE `$defs` closure to each body and returns
 * the result. THIS IS LOAD-BEARING: leaving `lowerObjectFields`'s own nested
 * `$defs` in place (pass 2 discards it via `delete computed["$defs"]`) would
 * make the in-memory fragment graph CYCLIC for a self or mutual reference —
 * `A.$defs.B.$defs.A === A` by object identity, because that nested `$defs`
 * holds the SAME placeholder objects pass 2 mutates — and these fragments
 * escape to `JSON.stringify` (the QRY-15 conveyance in
 * `renderTypedAwareQueryText`) and to AJV, neither safe to hand a cyclic
 * object graph. Because pass 2 strips every `bodies` value down to its own
 * fields (no `$defs`), the closure pass 3 attaches carries VALUES with no
 * `$defs` of their own, so every fragment this function returns is ACYCLIC
 * while staying transitively complete — the invariant `pruneDocumentDefs`
 * (query-schema-lowering.ts) and `binder-inference.ts`'s `inlineDefsRefs`
 * both rely on. A reached name resolves against `bodies` first,
 * `inlineBodies` second — an author-declared name wins a namespace clash with
 * a synthesised one, though the mint recipe makes that clash astronomically
 * unlikely on the slug alone, let alone the `__inline_` prefix.
 *
 * For an ACYCLIC document this produces the same final `pruneDocumentDefs`
 * output as the single-pass lowering did: today's per-fragment nested `$defs`
 * chain is hoisted to the same flat name set by that function's own HOIST
 * walk, then pruned by the same reachability walk — this function only
 * changes WHICH references resolve (forward and self references now do),
 * not the shape `pruneDocumentDefs` is handed for a reference graph the old
 * code already resolved.
 */
export function buildBodyTypeSchemas(
  schemas: readonly LowerableSchema[],
  enums: readonly LowerableEnum[],
  collisions?: SchemaSlugCollision[],
): Map<string, Record<string, unknown>> {
  // PASS 1 — seed the name set before any body lowers.
  const bodies = new Map<string, Record<string, unknown>>();
  for (const decl of enums) {
    bodies.set(decl.name, lowerEnumToSchema(decl.variants, decl.variantValues, decl.description));
  }
  for (const decl of schemas) {
    if (decl.fields === undefined && decl.arms === undefined) {
      continue;
    }
    bodies.set(decl.name, {});
  }

  // Document-scoped slug-collision sinks (see the doc comment above).
  const inlineCanonical = new Map<string, string>();
  const inlineFragments = new Map<string, Record<string, unknown>>();
  const slugCollisions: string[] = [];
  const sinks: InlineHoistSinks = { inlineCanonical, inlineFragments, slugCollisions };

  // PASS 2 — lower each body (object fields or alias/union right-hand side)
  // against the fully seeded map.
  const directRefs = new Map<string, readonly string[]>();
  const inlineBodies = new Map<string, Record<string, unknown>>();
  for (const decl of schemas) {
    let computed: Record<string, unknown>;
    let direct: string[];
    if (decl.fields !== undefined) {
      computed = lowerObjectFields(decl.fields, bodies, undefined, sinks);
      const nestedDefs = (computed["$defs"] ?? {}) as Record<string, Record<string, unknown>>;
      direct = Object.keys(nestedDefs);
      // FIRST WINS, matching the mint's own retention: a slug two decls both
      // mint resolves to the fragment the first one retained, so a later decl
      // must not displace what pass 3 will serve to the earlier decl's `$ref`.
      for (const [mintedName, fragment] of Object.entries(nestedDefs)) {
        if (!bodies.has(mintedName) && !inlineBodies.has(mintedName)) {
          inlineBodies.set(mintedName, fragment);
        }
      }
      // `computed` is fresh — `lowerObjectFields` built it above — so mutating
      // it here touches nothing else.
      delete computed["$defs"];
      if (decl.description !== undefined) {
        computed["description"] = decl.description;
      }
    } else if (decl.arms !== undefined) {
      // A fresh local `defs` per decl, exactly as `lowerObjectFields` builds
      // its own — `lowerTypeSource` never attaches a `$defs` key to the
      // fragment it returns, so the directly-referenced names live only in
      // this side-channel, never inside `computed` itself (nothing to
      // `delete` here).
      const localDefs: Record<string, Record<string, unknown>> = {};
      computed = lowerTypeSource(decl.arms.join(" | "), bodies, localDefs, undefined, sinks);
      if (decl.description !== undefined) {
        computed["description"] = decl.description;
      }
      direct = Object.keys(localDefs);
      // First-wins, as in the object-body arm above.
      for (const [mintedName, fragment] of Object.entries(localDefs)) {
        if (!bodies.has(mintedName) && !inlineBodies.has(mintedName)) {
          inlineBodies.set(mintedName, fragment);
        }
      }
    } else {
      continue;
    }
    const placeholder = bodies.get(decl.name);
    if (placeholder === undefined) {
      // Unreachable: pass 1 seeds a placeholder for every schema decl with
      // `fields` or `arms`, and this loop iterates that same list.
      continue;
    }
    // Clear-then-assign is REPLACE semantics (matching today's `map.set`) that
    // PRESERVES the placeholder's object identity — the identity a forward,
    // self, or mutual reference already captured as its `$ref` target while
    // this (or another) body's fields were lowering.
    for (const key of Object.keys(placeholder)) {
      delete placeholder[key];
    }
    Object.assign(placeholder, computed);
    directRefs.set(decl.name, direct);
    // Append-and-slice attribution, per decl — `parseParams`'s own pattern for
    // one `params:` field, applied here to one schema decl.
    if (collisions !== undefined) {
      for (const slug of slugCollisions.slice(collisions.length)) {
        collisions.push({ slug, schemaName: decl.name });
      }
    }
  }

  // PASS 3 — flatten each body's transitive $defs closure and return.
  const result = new Map<string, Record<string, unknown>>();
  for (const [name, body] of bodies) {
    const reached = transitiveDefNames(name, directRefs);
    if (reached.size === 0) {
      result.set(name, body);
      continue;
    }
    const closure: Record<string, Record<string, unknown>> = {};
    for (const reachedName of reached) {
      const reachedBody = bodies.get(reachedName) ?? inlineBodies.get(reachedName);
      if (reachedBody !== undefined) {
        closure[reachedName] = reachedBody;
      }
    }
    result.set(name, { ...body, $defs: closure });
  }
  return result;
}

/**
 * The set of names transitively reachable from `name` by following
 * `directRefs`, breadth-first with a visited-set cycle/termination guard —
 * INCLUDING `name` itself when a path leads back to it (a self or mutual
 * reference). Starts the walk at `name`'s OWN direct references, so `name`
 * is a member of the result only via such a path, never trivially.
 */
function transitiveDefNames(
  name: string,
  directRefs: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  const visited = new Set<string>();
  const queue: string[] = [...(directRefs.get(name) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (visited.has(next)) {
      continue;
    }
    visited.add(next);
    for (const ref of directRefs.get(next) ?? []) {
      queue.push(ref);
    }
  }
  return visited;
}

/**
 * The `NamedType` names in `source` that resolve to no member of `declared` —
 * a schema-body field type, an alias/union arm, or a `@<T>` query annotation
 * (including its inline-object-annotation field form) naming no in-scope
 * declaration — deduped to first-occurrence order (one diagnostic per
 * distinct name per position; bug 0028 §Fix). `declared` is the RESOLUTION
 * SET, not a lowering result: `collectBodyTypes` (theta-document.ts)
 * deliberately maps an imported `.thetalib` symbol to `{}` AS RESOLVED (bug
 * 0033 §Fix narrowed this permissive arm to imports and head-only
 * declarations — an alias-form schema name now lowers via
 * `buildBodyTypeSchemas`, concretely for the arm shapes `lowerTypeSource`
 * supports), so checking the lowering RESULT for a `{}` fragment would reject
 * those legal thetas too — this function is handed the NAME set and threads
 * an `unresolved` sink through the same resolution `lowerTypeExpr` already
 * performs, rather than re-deriving a second name-walk.
 *
 * `source` dispatches to `lowerInlineObject` when it IS a single enclosing
 * brace group and to `lowerTypeSource` otherwise — the same structural split
 * `lowerQueryResponseSchema` makes (`isSingleEnclosingBraceGroup` above; bug
 * 0053 §Fix), so a name nested inside either function's own inline-object
 * handling, an arm of a union included, still reaches this walk's
 * `unresolved` sink (bug 0039 §Fix parts A/B; bug 0053 §Fix).
 *
 * `reservedKeywords`, when supplied, carries a SECOND, DIFFERENTLY-SHAPED
 * class this walk also passes over: a reserved-keyword spelling used where a
 * `NamedType` was read is never a resolution failure (`NamedType ::= Ident`,
 * grammar.md:98, and a reserved spelling cannot be an `Ident`, lexical.md:20)
 * — it is `theta/parse/reserved-keyword-as-identifier`, never
 * `unresolved-named-type` (bug 0044 §Fix) — so it cannot travel in THIS
 * function's returned list without misnaming what the function's own name
 * and return type already commit to: an unresolved NAME. It travels instead
 * exactly as `lowerTypeSource` already threads `unresolved` itself — an
 * optional, caller-owned, append-only OUT-PARAMETER this function never
 * reads back — deduped to the same `[...new Set(...)]` posture the returned
 * list uses before being appended to the caller's array.
 *
 * `unspellable`, when supplied, is a FOURTH, differently-shaped class again
 * (bug 0061 §Fix): text `lowerTypeExpr`'s trailing catch-all lowers
 * permissively because it derives from no `Type` production at all — not a
 * name, resolved or not, and not a reserved keyword. It travels the identical
 * optional, caller-owned, append-only shape `reservedKeywords` does, with one
 * difference the count rule requires: NO dedup. §Fix constraint 4 refuses one
 * diagnostic per offending FRAGMENT, so two occurrences of the same junk text
 * in one declaration (`schema X = Cat + | Cat +`) must reach the caller as
 * two entries, not one — `[...new Set(...)]` would silently drop the second
 * fragment's refusal.
 */
export function collectUnresolvedNamedTypes(
  source: string,
  declared: ReadonlySet<string>,
  reservedKeywords?: string[],
  unspellable?: string[],
): string[] {
  const bodyTypeMap = new Map<string, Record<string, unknown>>(
    [...declared].map((name) => [name, {}] as const),
  );
  const unresolved: string[] = [];
  const keywordHits: string[] = [];
  const unspellableHits: string[] = [];
  const s = source.trim();
  if (isSingleEnclosingBraceGroup(s)) {
    lowerInlineObject(s.slice(1, -1), bodyTypeMap, unresolved, undefined, keywordHits, unspellableHits);
  } else {
    lowerTypeSource(s, bodyTypeMap, {}, unresolved, undefined, keywordHits, unspellableHits);
  }
  reservedKeywords?.push(...new Set(keywordHits));
  unspellable?.push(...unspellableHits);
  return [...new Set(unresolved)];
}
