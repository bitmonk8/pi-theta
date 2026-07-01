// V13b / V13b-T — the typed-query schema-inference seam.
//
// This module owns the parts of query/query-forms.md the V13b implementation
// leaf fills in:
//
//   - QRY-2 / QRY-3 — typed-query response-schema inference from the surrounding
//     type context, with the explicit `@<Schema>` ascription always overriding
//     the inferred contexts (QRY-3 override rule).
//   - The §"Schema inference algorithm" shallow outward walk: the query
//     expression searches outward through its enclosing AST for the *nearest*
//     (innermost) type sink, crossing the transparent constructs
//     (parenthesisation, the `let x: T =` RHS, a typed call/tool/invoke argument,
//     the declared-return tail / `return` operand, a ternary branch or array
//     element that itself has a sink, and the postfix error-propagation `?`) and
//     stopping at the opaque constructs (binary / unary operators, member and
//     indexed access, the `match` scrutinee, and the `if` / `while` condition).
//     The innermost sink wins; a walk that reaches a stop without a sink is
//     untyped.
//   - QRY-4 §"Explicit form" — the one-directional `loom/parse/explicit-schema-mismatch`
//     warning that fires when an explicit `@<Schema>` ascription is not
//     compatible with the binding annotation (`ascription ⋢ annotation` under
//     type-system.md §"Type compatibility"), skipped when either side is past
//     the parser's static view.
//   - schema-subset.md §"Lowering Algorithm" step 4 — the per-query request
//     schema document carries only the `$defs` transitively reachable from its
//     response-schema root; unreachable `$defs` are pruned.
//
// V13b-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function inertly so the failing tests compile and red on their own
// primary assertions: `inferQuerySchema` returns an unimplemented sentinel
// schema (so both the sink and the untyped assertions red), the
// `explicit-schema-mismatch` check returns an inert sentinel diagnostic (so both
// the firing and the no-warning vectors red), and `prunePerQueryDefs` is an
// identity that prunes nothing (so a document with an unreachable `$def` reds).
// The paired V13b implementation leaf fills these in.
//
// Spec: query/query-forms.md, schema-subset.md §"Lowering Algorithm" step 4.

import { type Diagnostic } from "../diagnostics/diagnostic";
import {
  checkCompatible,
  type CompatSite,
  type CompatType,
  type PrimitiveName,
  type TypeEnv,
} from "./type-compat";

// --- Inferred schema model --------------------------------------------------

/**
 * The response schema an inference walk resolves for a typed query. This is the
 * inference-purpose projection of a schema type — enough to name a sink and to
 * unwrap an `array<T>` sink's element type for an array-literal element:
 *
 *   - `primitive` — a primitive schema (`string`, `number`, `integer`,
 *     `boolean`, `null`).
 *   - `named`     — a named schema reference (`schema X { … }` / `schema X = …`).
 *   - `array`     — `array<T>`, whose `element` an array-literal sink hands to
 *     each element position.
 */
export type InferredSchema =
  | { readonly kind: "primitive"; readonly name: PrimitiveName }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "array"; readonly element: InferredSchema };

/**
 * One enclosing AST frame between a query expression and the outermost context,
 * ordered innermost-first in an `inferQuerySchema` input. The §"Schema inference
 * algorithm" classifies each construct as *crossed* (transparent — the walk
 * continues outward) or *stopped* (opaque — the walk halts):
 *
 *   - `paren`        — parenthesisation `(…)`. Crossed.
 *   - `propagate`    — the postfix error-propagation `?` (ERR-18), whose unwrap
 *     of `Result<T, QueryError>` to `T` preserves the operand's type context.
 *     Crossed.
 *   - `ternary`      — a ternary branch `cond ? a : b`. Crossed iff the ternary
 *     itself has a sink (the walk continues outward to find it).
 *   - `array-literal`— an array-literal element `[a, b]`. Crossed iff the literal
 *     has a sink; the element inherits the sink's `array<T>` element type.
 *   - `let`          — the RHS of `let x: T = …`; the sink is the binding
 *     annotation `T`.
 *   - `call-arg`     — a function / tool / `invoke` argument matched to a
 *     parameter; the sink is the typed parameter (a call boundary — the walk
 *     does not continue past it, so an untyped parameter yields no sink).
 *   - `fn-return`    — the tail expression or `return` operand of an enclosing
 *     function with a declared return type; the sink is that return type. A
 *     `.loom` file has no declared return type, so it supplies no sink here.
 *   - `stop`         — an opaque construct (binary / unary operator, member or
 *     indexed access, `match` scrutinee, `if` / `while` condition). Stopped; the
 *     `label` names the construct for diagnostics.
 */
export type SchemaSinkFrame =
  | { readonly kind: "paren" }
  | { readonly kind: "propagate" }
  | { readonly kind: "ternary" }
  | { readonly kind: "array-literal" }
  | { readonly kind: "let"; readonly annotation: InferredSchema }
  | { readonly kind: "call-arg"; readonly paramType?: InferredSchema }
  | { readonly kind: "fn-return"; readonly returnType?: InferredSchema }
  | { readonly kind: "stop"; readonly label: string };

/** The input to `inferQuerySchema`: the enclosing frames and the explicit ascription. */
export interface QuerySchemaInferenceInput {
  /** Enclosing AST frames, ordered innermost-first (nearest sink wins). */
  readonly frames: readonly SchemaSinkFrame[];
  /** An explicit `@<Schema>` ascription, when present — always overrides (QRY-3). */
  readonly explicit?: InferredSchema;
}

/**
 * Unwrap `depth` `array<T>` levels off a resolved sink schema. Each crossed
 * `array-literal` frame contributes one level: an array-literal element inherits
 * its enclosing array sink's element type (query-forms.md §"Schema inference
 * algorithm" — `let xs: array<Score> = [@`...`?]` hands `Score` to each element).
 * If the sink is not an `array` at some level (a type error diagnosed elsewhere),
 * the unwrap stops and returns what remains.
 */
function unwrapArrayLevels(schema: InferredSchema, depth: number): InferredSchema {
  let current = schema;
  for (let i = 0; i < depth; i++) {
    if (current.kind !== "array") {
      return current;
    }
    current = current.element;
  }
  return current;
}

/**
 * Infer a typed query's response schema (QRY-2 / QRY-3). When an explicit
 * `@<Schema>` ascription is present it always supplies the schema and overrides
 * the inference contexts (QRY-3). Otherwise the §"Schema inference algorithm"
 * walk searches `frames` outward for the nearest (innermost) type sink, crossing
 * transparent constructs and stopping at opaque ones; a walk that reaches a stop
 * (or exhausts the frames) without a sink returns `undefined` (untyped, `string`).
 *
 * The walk is shallow (query-forms.md §"Schema inference algorithm"):
 *   - `paren` / `propagate` — context-preserving, crossed.
 *   - `ternary` — crossed; the ternary is transparent and the walk continues
 *     outward to the sink the ternary itself has (if any).
 *   - `array-literal` — crossed; the element inherits the enclosing array sink's
 *     element type, so one `array<T>` level is unwrapped off the resolved sink
 *     per crossed array-literal frame.
 *   - `let` — the binding annotation is the sink (innermost wins).
 *   - `call-arg` — a call boundary: a typed parameter is the sink; an untyped
 *     parameter yields no sink and the walk does NOT continue past it (untyped).
 *   - `fn-return` — a declared return type is the sink; a `.loom` (no declared
 *     return type) supplies none and the walk continues outward.
 *   - `stop` — opaque; the walk halts with no sink (untyped).
 */
export function inferQuerySchema(
  input: QuerySchemaInferenceInput,
): InferredSchema | undefined {
  // QRY-3 — an explicit `@<Schema>` ascription always overrides the walk,
  // regardless of where the query appears.
  if (input.explicit !== undefined) {
    return input.explicit;
  }

  let arrayDepth = 0;
  for (const frame of input.frames) {
    switch (frame.kind) {
      case "paren":
      case "propagate":
      case "ternary":
        // Transparent: continue the outward walk.
        break;
      case "array-literal":
        // Crossed iff the literal has a sink; each element inherits one
        // `array<T>` level off that sink.
        arrayDepth++;
        break;
      case "let":
        return unwrapArrayLevels(frame.annotation, arrayDepth);
      case "call-arg":
        // A call boundary: a typed parameter is the sink; an untyped parameter
        // yields no sink and the walk stops (the outer context is not visible
        // past the call boundary).
        return frame.paramType === undefined
          ? undefined
          : unwrapArrayLevels(frame.paramType, arrayDepth);
      case "fn-return":
        // A declared return type is the sink; a `.loom` supplies none, so the
        // walk continues outward.
        if (frame.returnType !== undefined) {
          return unwrapArrayLevels(frame.returnType, arrayDepth);
        }
        break;
      case "stop":
        // Opaque: the walk halts with no sink (untyped, `string`).
        return undefined;
    }
  }
  // The walk exhausted its frames without reaching a sink: untyped.
  return undefined;
}

// --- Explicit-schema-mismatch (QRY-4 §"Explicit form") ---------------------

/** `loom/parse/explicit-schema-mismatch` (W). */
export const EXPLICIT_SCHEMA_MISMATCH_CODE = "loom/parse/explicit-schema-mismatch";

/**
 * Registry Message for `loom/parse/explicit-schema-mismatch`, sourced verbatim
 * from diagnostics/code-registry-parse.md per the Diagnostic message anchors
 * rule.
 */
export const EXPLICIT_SCHEMA_MISMATCH_MESSAGE =
  "explicit @<Schema> ascription is not compatible with binding annotation";

/**
 * QRY-4 §"Explicit form" — the one-directional `loom/parse/explicit-schema-mismatch`
 * warning. When both a binding annotation and an explicit `@<Schema>` ascription
 * are present, the explicit one is used, with the warning emitted iff
 * `ascription ⋢ annotation` under type-system.md §"Type compatibility". The check
 * fires in one direction only (a value the explicit form would produce that the
 * annotation could not accept); a safe widening is silent. When either side is
 * past the parser's static view the warning is skipped (the runtime AJV check is
 * the safety net). Returns the warning diagnostic, or `[]` when no warning fires.
 *
 * V13b-T stubs this inert (a sentinel diagnostic); the paired V13b leaf computes
 * the relation via type-compat's `checkCompatible(ascription, annotation, env)`.
 */
export function checkExplicitSchemaMismatch(opts: {
  readonly ascription: CompatType;
  readonly annotation: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { ascription, annotation, env, site } = opts;
  // One-directional: fire iff `ascription ⋢ annotation` — a value the explicit
  // form would produce that the binding annotation could not accept. A safe
  // widening (`ascription ⊑ annotation`) is silent, and an operand past the
  // parser's static view (`"unknown"`) is skipped (the runtime AJV check is the
  // safety net).
  const relation = checkCompatible(ascription, annotation, env);
  if (relation === "compatible" || relation === "unknown") {
    return [];
  }
  // `"incompatible"` or `"integer-narrowing"` — the ascription is not `⊑` the
  // annotation; the explicit form could yield a value the binding cannot accept.
  return [
    {
      severity: "warning",
      code: EXPLICIT_SCHEMA_MISMATCH_CODE,
      file: site.file,
      range: site.range,
      message: EXPLICIT_SCHEMA_MISMATCH_MESSAGE,
    },
  ];
}

// --- Per-query `$defs` pruning (schema-subset.md Lowering step 4) -----------

/**
 * A per-query request schema document, projected to its `$ref` reachability
 * graph: the response-schema root's own `$ref` targets and, per named `$def`,
 * the `$def` names it references. Recursive references (a def referencing itself
 * or a cycle) are permitted.
 */
export interface QueryDefsDocument {
  /** `$def` names the response-schema root references directly. */
  readonly rootRefs: readonly string[];
  /** Each `$def` name to the `$def` names it references. */
  readonly defs: Readonly<Record<string, readonly string[]>>;
}

/**
 * schema-subset.md §"Lowering Algorithm" step 4 — build the per-query request
 * schema document's `$defs`: keep only the `$defs` transitively reachable from
 * the response-schema root; prune the unreachable ones. Recursive references are
 * followed once (a visited set bounds the walk).
 *
 * V13b-T stubs this as an identity that prunes nothing (returns every `$def`),
 * so a document containing an unreachable `$def` reds the pruning assertion; the
 * paired V13b implementation leaf performs the reachability prune.
 */
export function prunePerQueryDefs(
  doc: QueryDefsDocument,
): Readonly<Record<string, readonly string[]>> {
  // Breadth-first reachability from the response-schema root's direct `$ref`
  // targets through the per-`$def` reference graph. A visited set bounds the
  // walk so recursive references (a def referencing itself, or a cycle)
  // terminate. Only visited defs survive; unreachable defs are pruned.
  const reachable = new Set<string>();
  const queue: string[] = [...doc.rootRefs];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (reachable.has(name)) {
      continue;
    }
    reachable.add(name);
    const refs = doc.defs[name];
    if (refs !== undefined) {
      queue.push(...refs);
    }
  }

  const pruned: Record<string, readonly string[]> = {};
  for (const [name, refs] of Object.entries(doc.defs)) {
    if (reachable.has(name)) {
      pruned[name] = refs;
    }
  }
  return pruned;
}
