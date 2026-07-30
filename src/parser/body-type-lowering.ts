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

import { lowerTypeExpr, splitTopLevel, type LowerCtx } from "./params";

/** A lowerable object-body field: a field name and its verbatim type source. */
export interface LowerableField {
  readonly name: string;
  readonly typeSource: string;
}

/** A schema declaration reduced to what lowering needs. */
export interface LowerableSchema {
  readonly name: string;
  /** Object-body field sources; absent for `= …` alias / `by … = …` union forms. */
  readonly fields?: readonly LowerableField[];
}

/** An enum declaration reduced to what lowering needs. */
export interface LowerableEnum {
  readonly name: string;
  /** Declared variant names in source order. */
  readonly variants?: readonly string[];
  /** Explicit `= "wire"` values keyed by variant name; a variant absent here uses its name. */
  readonly variantValues?: Readonly<Record<string, string>>;
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
): Record<string, unknown> {
  const values = (variants ?? []).map((name) => variantValues?.[name] ?? name);
  return { type: "string", enum: values };
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
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const defs: Record<string, Record<string, unknown>> = {};
  for (const field of fields) {
    properties[field.name] = lowerTypeSource(field.typeSource, bodyTypeMap, defs, unresolved);
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

/** Lower an inline object type's comma-separated `field: Type` body. */
export function lowerInlineObject(
  body: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  unresolved?: string[],
): Record<string, unknown> {
  const fields: LowerableField[] = [];
  for (const entry of splitTopLevel(body, ",")) {
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
  return lowerObjectFields(fields, bodyTypeMap, unresolved);
}

/**
 * Lower a single type-expression source to its JSON-Schema fragment. A literal
 * union (`"a" | "b"`) lowers to an `enum`, a single literal to a `const`, and
 * every other form (primitive, `array<T>`, named type, non-literal union)
 * delegates to the `params:` `lowerTypeExpr` machinery.
 *
 * `unresolved`, when supplied, is a SINK (bug 0028 §Fix): every `NamedType`
 * name `lowerTypeExpr` cannot resolve against `bodyTypeMap` is appended to it.
 * The caller owns the array's lifetime — this function never reads it back —
 * so `lowerObjectFields` / `lowerInlineObject` thread the SAME array across
 * every field of one body and `collectUnresolvedNamedTypes` reads it after
 * the call returns. Omitted, the names are collected into a throwaway array
 * and discarded, which is the behaviour every OTHER caller relies on (the
 * lowering itself stays permissive regardless of `unresolved`).
 */
export function lowerTypeSource(
  source: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  defs: Record<string, Record<string, unknown>>,
  unresolved?: string[],
): Record<string, unknown> {
  const s = source.trim();

  const arms = splitTopLevel(s, "|");
  if (arms.length > 1) {
    const literals = arms.map(parseLiteralArm);
    if (literals.every((lit) => lit !== undefined)) {
      return { enum: literals.map((lit) => (lit as { readonly value: unknown }).value) };
    }
  } else {
    const lit = parseLiteralArm(s);
    if (lit !== undefined) {
      return { const: lit.value };
    }
  }

  const ctx: LowerCtx = { bodyTypeMap, defs, unresolved: unresolved ?? [] };
  return lowerTypeExpr(s, ctx);
}

/**
 * Build the whole-file name → lowered-fragment map for a theta body's `schema`
 * and `enum` declarations, in TWO passes over a shared, mutable `bodies` map
 * (bug 0028 §Fix) plus a third pass that attaches each name's flat transitive
 * `$defs` closure:
 *
 * PASS 1 seeds `bodies` with every top-level name BEFORE any object body
 * lowers: an enum's fragment lowers fully (lowering order never affects an
 * enum); a schema WITH an object body gets a MUTABLE PLACEHOLDER object, set
 * UNCONDITIONALLY so a schema still wins a name collision against an enum —
 * this loop runs second, exactly as today. A schema decl carrying no object
 * body (an `= …` alias or `by … = …` discriminated union) seeds nothing —
 * its callers supply a permissive fallback, as today.
 *
 * PASS 2 lowers each schema's fields against the FULLY SEEDED map, in source
 * order, then REPLACES the placeholder's own keys with the computed ones —
 * clear-then-`Object.assign`, not a fresh `bodies.set` — so the placeholder's
 * OBJECT IDENTITY survives. That identity is what makes a forward, self, or
 * mutual reference resolve: `lowerTypeExpr`'s identifier atom (params.ts)
 * looks the name up in `bodies` while every body is lowering, not only the
 * ones lowered so far, so it finds the (possibly still-empty, but PRESENT)
 * placeholder and mints a `$ref` instead of taking the unresolved arm
 * (schemas.md §Recursion; schema-subset.md §Lowering Algorithm step 3).
 * `directRefs` records the names each body's fields name DIRECTLY, for pass 3
 * to turn into a transitive closure.
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
 * both rely on.
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
): Map<string, Record<string, unknown>> {
  // PASS 1 — seed the name set before any body lowers.
  const bodies = new Map<string, Record<string, unknown>>();
  for (const decl of enums) {
    bodies.set(decl.name, lowerEnumToSchema(decl.variants, decl.variantValues));
  }
  for (const decl of schemas) {
    if (decl.fields === undefined) {
      continue;
    }
    bodies.set(decl.name, {});
  }

  // PASS 2 — lower each object body against the fully seeded map.
  const directRefs = new Map<string, readonly string[]>();
  for (const decl of schemas) {
    if (decl.fields === undefined) {
      continue;
    }
    const computed = lowerObjectFields(decl.fields, bodies);
    const direct = Object.keys((computed["$defs"] ?? {}) as object);
    // `computed` is fresh — `lowerObjectFields` just built it — so mutating it
    // here touches nothing else.
    delete computed["$defs"];
    const placeholder = bodies.get(decl.name);
    if (placeholder === undefined) {
      // Unreachable: pass 1 seeds a placeholder for every schema decl with
      // `fields`, and this loop iterates that same list.
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
      const reachedBody = bodies.get(reachedName);
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
 * a schema-body field type or a `@<T>` query annotation (including its
 * inline-object-annotation field form) naming no in-scope declaration —
 * deduped to first-occurrence order (one diagnostic per distinct name per
 * position; bug 0028 §Fix). `declared` is the RESOLUTION SET, not a lowering
 * result: `collectBodyTypes` (theta-document.ts) deliberately maps alias-form
 * schema names and imported `.thetalib` symbols to `{}` AS RESOLVED, so
 * checking the lowering RESULT for a `{}` fragment would reject those legal
 * thetas too — this function is handed the NAME set and threads an
 * `unresolved` sink through the same resolution `lowerTypeExpr` already
 * performs, rather than re-deriving a second name-walk.
 *
 * `source` dispatches the inline-object annotation form itself (`{ … }`,
 * which `lowerTypeSource` does not handle — `lowerQueryResponseSchema`
 * dispatches it to `lowerInlineObject` directly) before falling through to
 * `lowerTypeSource` for every other annotation / field-type shape.
 */
export function collectUnresolvedNamedTypes(
  source: string,
  declared: ReadonlySet<string>,
): string[] {
  const bodyTypeMap = new Map<string, Record<string, unknown>>(
    [...declared].map((name) => [name, {}] as const),
  );
  const unresolved: string[] = [];
  const s = source.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    lowerInlineObject(s.slice(1, -1), bodyTypeMap, unresolved);
  } else {
    lowerTypeSource(s, bodyTypeMap, {}, unresolved);
  }
  return [...new Set(unresolved)];
}

/**
 * Parse a literal-type atom (a quoted string, integer/number, boolean, or
 * `null`) to its JSON value, or `undefined` when the atom is not a literal.
 * Wrapped so a legitimately-`null` literal is distinguishable from "not a
 * literal".
 */
function parseLiteralArm(source: string): { readonly value: unknown } | undefined {
  const s = source.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    return { value: s.slice(1, -1) };
  }
  if (s === "true") {
    return { value: true };
  }
  if (s === "false") {
    return { value: false };
  }
  if (s === "null") {
    return { value: null };
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return { value: Number(s) };
  }
  return undefined;
}

/** Find the top-level `:` in a `field: Type` entry, respecting `<>`/`{}` nesting. */
function topLevelColon(entry: string): number {
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
