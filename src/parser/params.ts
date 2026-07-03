// V6b / V6b-T — the `params:` contract seam.
//
// This module owns the `params:` field contract of
// frontmatter/frontmatter-fields-a.md §params and §Defaults: the type-expression
// RHS (with whole-file forward references to body `schema`/`enum` declarations),
// the literal-sublanguage defaults, the no-non-defaulted-after-defaulted
// ordering rule, and the lowering of `params:` to a single AJV-validatable
// JSON-Schema document.
//
// The four behaviour-bearing checks this seam owns:
//
//   - `loom/parse/non-trailing-default` — a non-defaulted param placed after a
//     defaulted param in declaration order; the diagnostic names the first
//     offending non-defaulted field.
//   - `loom/parse/default-not-literal` — a default RHS outside the loom literal
//     sublanguage; delegated to the `V2a` literal-sublanguage check, whose
//     diagnostic names the offending sub-expression.
//   - `loom/parse/unresolved-named-type` — a `params:` RHS `NamedType` that
//     resolves to no body `schema`/`enum` declaration or imported `.warp`
//     symbol. Resolution is whole-file, so a frontmatter-to-body forward
//     reference is not itself a failure.
//   - the lowered schema — the per-loom `params:` object document, validated
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
  lowerUnion,
  type LoweredPrimitiveType,
  type LoweredUnionArm,
} from "./schema-lowering";

/**
 * One `params:` field as written in source, in declaration order.
 *
 *   - `name`          — the param's loom-side identifier.
 *   - `typeSource`    — the right-hand-side type expression verbatim, parsed by
 *                       the loom type grammar (a primitive, a generic, or a
 *                       `NamedType` resolved whole-file against `bodyTypes`).
 *   - `defaultSource` — the default RHS verbatim, present iff the field carries
 *                       a `= <literal>` default; checked against the loom
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
 * `enum` declaration, or a symbol imported from a `.warp` module. Resolution is
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
 * block lowered cleanly (no `loom/parse/unresolved-named-type`, no ordering or
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
 *   - `loom/parse/non-trailing-default` — a non-defaulted field after a
 *     defaulted field (the diagnostic names the first offending field);
 *   - `loom/parse/default-not-literal` — a default RHS outside the literal
 *     sublanguage (the diagnostic names the offending sub-expression);
 *   - `loom/parse/unresolved-named-type` — a RHS `NamedType` resolving to no
 *     `bodyTypes` entry (whole-file resolution, so forward references resolve);
 *   - `loweredSchema` — the per-loom object schema (non-defaulted fields
 *     `required`, named types lowered to in-document `$ref`s against `$defs`),
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
  for (const field of fields) {
    const lowerCtx: LowerCtx = { bodyTypeMap, defs, unresolved: [] };
    properties[field.name] = lowerTypeExpr(field.typeSource, lowerCtx);
    for (const name of lowerCtx.unresolved) {
      diagnostics.push({
        severity: "error",
        code: "loom/parse/unresolved-named-type",
        file: site.file,
        range: field.range,
        message: `unresolved named type '${name}'`,
      });
    }
    if (field.defaultSource === undefined) {
      required.push(field.name);
    }
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
        code: "loom/parse/non-trailing-default",
        file: site.file,
        range: field.range,
        message: `non-defaulted param '${field.name}' follows a defaulted param; defaulted params must be trailing`,
      });
      break;
    }
  }

  // Each default RHS must be a Loom literal-sublanguage form; the is-literal
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
  if (Object.keys(defs).length > 0) {
    loweredSchema["$defs"] = defs;
  }
  return { diagnostics, loweredSchema: loweredSchema as LoweredSchema };
}

/** The lowering context threaded through a single field's type expression. */
export interface LowerCtx {
  readonly bodyTypeMap: ReadonlyMap<string, Record<string, unknown>>;
  /** Resolved named types, collected as `$defs` entries (shared across fields). */
  readonly defs: Record<string, Record<string, unknown>>;
  /** `NamedType` names this field references that resolve to no declaration. */
  readonly unresolved: string[];
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
 *     declaration — records the name for the `loom/parse/unresolved-named-type`
 *     diagnostic and lowers permissively.
 *
 * Literal-type and inline-object lowering beyond this subset is owned by the
 * schema-subset lowering leaves, not this seam; an unrecognised form lowers
 * permissively (`{}`) while still resolving any `NamedType` it nests.
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
 * Split a type expression on a top-level `separator`, respecting `<...>` angle
 * nesting and `"`/`'` string literals so nested generics and literal arms are
 * not split mid-token. Empty segments are dropped.
 */
export function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
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
    if (c === "<") {
      depth += 1;
      current += c;
      continue;
    }
    if (c === ">") {
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
