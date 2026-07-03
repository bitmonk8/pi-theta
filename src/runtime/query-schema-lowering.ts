// V13e — lower a typed `@<Schema>` query's declared response schema to the
// validating JSON Schema (QRY-22 / SUBS-1), reusing the `params:` type-lowering
// machinery (`lowerTypeExpr` / `splitTopLevel`).
//
// A typed query's declared schema annotation is one of:
//   - a named `schema` decl (`@<Triage>`), resolved whole-file against the
//     loom body's `schema` declarations to its retained object-body field
//     sources;
//   - an inline object type (`@<{ status: "ok" | "degraded", summary: string }>`);
//   - an inline primitive / union / `array<T>` type (`@<string>`, `@<A | B>`).
//
// Each lowers to an AJV-validatable `LoweredSchema` so the runtime execution
// path validates the response against the declared schema rather than binding an
// unvalidated payload (the QRY-22 obligation V13e integrates). String / number /
// boolean / null literal unions lower to `enum`, so a declared literal set is
// validated; a nested cross-schema `NamedType` inside another schema's body
// lowers permissively (`{}`) — the query's own declared shape is the validated
// contract, its structural fields (`type`, `required`, `additionalProperties`)
// caught precisely.
//
// Spec: schema-subset.md (SUBS-1 lowering), query/query-failure-and-repair.md
// (QRY-22).

import type { LoweredSchema } from "../seams/schema-validator";
import type { SchemaDecl, SchemaFieldSource } from "../parser/loom-document";
import {
  lowerTypeExpr,
  splitTopLevel,
  type LowerCtx,
} from "../parser/params";

/** An identifier-shaped atom (a bare `NamedType` reference). */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Lower a typed query's declared response-schema annotation to its
 * AJV-validatable JSON Schema (QRY-22 / SUBS-1), or `undefined` when the
 * annotation carries no lowerable shape. `annotation` is the verbatim
 * `@<Schema>` text; `schemas` are the loom body's `schema` declarations, used to
 * resolve a named reference whole-file to its retained object-body fields.
 */
export function lowerQueryResponseSchema(
  annotation: string,
  schemas: readonly SchemaDecl[],
): LoweredSchema | undefined {
  const bodyTypeMap = buildBodyTypeMap(schemas);
  const s = annotation.trim();
  if (s.length === 0) {
    return undefined;
  }

  // A named `schema` decl: its retained object body is the response schema
  // (returned directly so the root is the object shape, not a `$ref` wrapper).
  if (IDENTIFIER.test(s)) {
    const named = bodyTypeMap.get(s);
    if (named !== undefined) {
      return named as LoweredSchema;
    }
  }

  // An inline object type `{ field: Type, … }`.
  if (s.startsWith("{") && s.endsWith("}")) {
    return lowerInlineObject(s.slice(1, -1), bodyTypeMap) as LoweredSchema;
  }

  // An inline primitive / union / `array<T>` type.
  const defs: Record<string, Record<string, unknown>> = {};
  const root = lowerTypeSource(s, bodyTypeMap, defs);
  const result: Record<string, unknown> = { ...root };
  if (Object.keys(defs).length > 0) {
    result["$defs"] = defs;
  }
  return result as LoweredSchema;
}

/**
 * Lower every named `schema` decl's retained object body to its JSON-Schema
 * object fragment, keyed by name so a query annotation resolves a `NamedType`
 * whole-file (declaration order does not matter). A decl carrying no object body
 * (an `= …` alias or `by … = …` discriminated union) contributes no entry.
 */
function buildBodyTypeMap(
  schemas: readonly SchemaDecl[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const decl of schemas) {
    if (decl.fields === undefined) {
      continue;
    }
    map.set(decl.name, lowerObjectFields(decl.fields, map));
  }
  return map;
}

/**
 * Lower a list of object-body field sources to an object JSON Schema: every
 * field `required` (a declared schema field is mandatory) and
 * `additionalProperties: false` (an undeclared property is a validation
 * failure), matching the `params:` object-lowering shape.
 */
function lowerObjectFields(
  fields: readonly SchemaFieldSource[],
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const defs: Record<string, Record<string, unknown>> = {};
  for (const field of fields) {
    properties[field.name] = lowerTypeSource(field.typeSource, bodyTypeMap, defs);
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
function lowerInlineObject(
  body: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> {
  const fields: SchemaFieldSource[] = [];
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
  return lowerObjectFields(fields, bodyTypeMap);
}

/**
 * Lower a single type-expression source to its JSON-Schema fragment. A literal
 * union (`"a" | "b"`) lowers to an `enum`, a single literal to a `const`, and
 * every other form (primitive, `array<T>`, named type, non-literal union)
 * delegates to the `params:` `lowerTypeExpr` machinery.
 */
function lowerTypeSource(
  source: string,
  bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>,
  defs: Record<string, Record<string, unknown>>,
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

  const ctx: LowerCtx = { bodyTypeMap, defs, unresolved: [] };
  return lowerTypeExpr(s, ctx);
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
