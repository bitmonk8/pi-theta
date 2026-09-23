// Parse-time tool-call argument checks and schema-subset disjointness.
//
//   - The parse-time argument checks with the arity-before-shape-before-type
//     ordering: `theta/parse/tool-arg-arity` (a multi-argument Pi-tool call),
//     then the surviving bare-object *shape* rule
//     (`theta/parse/tool-arg-not-object-literal`: `read(args)` is not an inline
//     object literal), then `theta/parse/tool-arg-type-mismatch` (a
//     statically-resolvable `.theta`-callable argument that does not match the
//     callee's `params:`), then the RFC 0002
//     `theta/parse/tool-arg-schema-conflict` provable-disjointness front-run
//     (a Pi-tool field expression whose static type is provably disjoint from
//     the schema field type). Arity is checked before the others: a call that
//     both over-supplies positional arguments and type-mismatches fires only the
//     arity code. RFC 0002 retired `theta/parse/tool-arg-not-literal` for Pi-tool
//     call sites: field values are now full Theta expressions.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { isBareObjectLiteral } from "./literal-sublanguage";
// RFC 0002: reuse the single top-level-union splitter (the schema-subset
// disjointness reduction below and the type-layer checks must agree on arm
// boundaries); a duplicate previously lived here and was removed.
import { splitTopLevelUnion } from "./type-layer-checks";

// --------------------------------------------------------------------------
// Parse-time argument checks (arity → not-literal → type; arity before type)
// --------------------------------------------------------------------------

/** Which callee kind a code-side `<name>(args)` call resolves to.
 *  RFC 0011: `"runtime-tool"` widened for the fixed-signature arity/type checks
 *  (tool-calls.md #session-control-runtime-tools). */
export type ToolCallCalleeKind = "pi-tool" | "theta-callable" | "runtime-tool";

/**
 * The static-resolution facts a `.theta`-callable argument type-mismatch check
 * consumes (tool-calls.md §"Argument shape"). Type-mismatch is a parse error
 * only for a `.theta` callee that is *statically resolvable*; a Pi-tool argument
 * mismatch is never a parse error (it surfaces at runtime as
 * `Err(CodeToolError { cause: "validation", ... })`).
 */
export interface ToolCallStaticResolution {
  /** Whether the `.theta` callee is statically resolvable per invocation.md. */
  readonly resolvable: boolean;
  /** Whether the argument type-checks against the callee's `params:`. */
  readonly matches: boolean;
  /** Rendered expected type, for the `<expected>` placeholder. */
  readonly expected: string;
  /** Rendered actual type, for the `<actual>` placeholder. */
  readonly actual: string;
}

/**
 * RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) precomputed
 * provable-disjointness facts for one Pi-tool argument field, mirroring the
 * `ToolCallStaticResolution` precomputed-facts pattern above. The parser front
 * runs a *certain* runtime AJV rejection only when a field expression's static
 * type is **provably disjoint** (empty accepted-value intersection under the
 * [schema subset](../../docs/reference/schema-subset.md) mapping) from the
 * tool's registered input-schema type for that field. `checkToolCallArguments`
 * emits `theta/parse/tool-arg-schema-conflict` iff `provablyDisjoint` is true;
 * an unprovable mismatch (a `format`, `pattern`, numeric refinement, or a union
 * with at least one satisfiable arm) falls through to the runtime AJV check and
 * raises nothing at parse time. `computeToolArgSchemaConflict` is the real
 * static-type × schema-subset computation that populates this field in
 * production.
 */
export interface ToolArgSchemaConflictFacts {
  /** The Pi-tool input-schema field the expression is bound to. */
  readonly field: string;
  /** Whether the field expression's static type is provably disjoint. */
  readonly provablyDisjoint: boolean;
  /** Rendered schema field type, for the `<expected>` placeholder. */
  readonly expected: string;
  /** Rendered field-expression static type, for the `<actual>` placeholder. */
  readonly actual: string;
}

/**
 * A single code-side `<name>(args)` call site, as seen by the parse-time
 * argument checks.
 */
export interface ToolCallArgCheckInput {
  /** Post-rename callable-set name as written in `tools:` / at the call site. */
  readonly toolName: string;
  readonly calleeKind: ToolCallCalleeKind;
  /** Number of positional arguments written at the call site. */
  readonly positionalCount: number;
  /**
   * Source text of the single positional argument (the bare object literal),
   * checked against the literal sublanguage for a Pi-tool call. Absent when
   * arity already failed or the call is a `.theta`-callable call.
   */
  readonly argumentSource?: string;
  /** Static-resolution facts for a `.theta`-callable type-mismatch check. */
  readonly staticResolution?: ToolCallStaticResolution;
  /**
   * RFC 0002 provable-disjointness facts for a Pi-tool argument field (the
   * precomputed static-type × schema-subset result). When present and
   * `provablyDisjoint`, `theta/parse/tool-arg-schema-conflict` fires. Supplied
   * explicitly by tests that thread the precomputed fact; a production caller
   * that has only the raw static types passes `schemaFieldStaticTypes` instead
   * and lets the check compute the facts itself.
   */
  readonly schemaConflict?: ToolArgSchemaConflictFacts;
  /**
   * RFC 0002 raw static-type inputs for the Pi-tool argument's fields, from
   * which `checkToolCallArguments` computes the provable-disjointness facts
   * itself (via `computeToolArgSchemaConflict`) when `schemaConflict` is not
   * supplied. This keeps the real static-type × schema-subset computation on the
   * check's own code path rather than requiring a caller to precompute it, while
   * the explicit `schemaConflict` field preserves the tests' facts-threading
   * contract. Each entry pairs a field's rendered field-expression static type
   * with its schema field type; the first field the computation proves disjoint
   * fires `theta/parse/tool-arg-schema-conflict`.
   */
  readonly schemaFieldStaticTypes?: readonly {
    readonly field: string;
    readonly exprType: string;
    readonly schemaType: string;
  }[];
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Run the parse-time argument checks for a code-side `<name>(args)` call,
 * returning every diagnostic raised. The checks run in order — arity, then
 * not-literal, then type-mismatch — and **arity is checked before type**: a
 * call that both over-supplies positional arguments and type-mismatches fires
 * only `theta/parse/tool-arg-arity`, not `theta/parse/tool-arg-type-mismatch`.
 */
export function checkToolCallArguments(
  input: ToolCallArgCheckInput,
): Diagnostic[] {
  // (1) Arity — checked before type. A code-side call site carries at most one
  // positional argument surface: a Pi tool takes a single object argument
  // (tool-calls.md §"Argument shape": `read({...}, {...})` is
  // `theta/parse/tool-arg-arity` regardless of the argument shapes). An
  // over-supplied positional count short-circuits before any type check, so a
  // call that both over-supplies arguments and type-mismatches fires only the
  // arity code.
  if (input.positionalCount > 1) {
    return [
      {
        severity: "error",
        code: "theta/parse/tool-arg-arity",
        file: input.file,
        range: input.range,
        message: `Pi tool '${input.toolName}' takes a single object argument; got ${input.positionalCount}`,
      },
    ];
  }

  // (2) Shape — the single positional Pi-tool argument must be written inline as
  // a bare object literal `{ ... }` so the tool's registered input schema can
  // supply the field names (tool-calls.md §"Argument shape"; grammar.md
  // §"Pi-tool argument grammar"). RFC 0002 lifted the *value* restriction (field
  // values are now full Theta expressions, so the retired
  // `theta/parse/tool-arg-not-literal` is no longer emitted) but kept the *shape*
  // rule: a whole `let`-bound object passed positionally (`read(args)`) parses
  // to a bare identifier, not a `{ ... }` literal, and is rejected here. The
  // dedicated `theta/parse/tool-arg-not-object-literal` code names the actual
  // violation — the argument must be inlined — rather than reusing
  // `theta/parse/bare-object-literal`, whose "name the schema (Schema { ... })"
  // remedy misdirects the author here (naming a schema is not the fix; the
  // tool's registered input schema already supplies the shape, so the fix is to
  // inline the object literal).
  if (
    input.calleeKind === "pi-tool" &&
    input.argumentSource !== undefined &&
    !isBareObjectLiteral(input.argumentSource)
  ) {
    return [
      {
        severity: "error",
        code: "theta/parse/tool-arg-not-object-literal",
        file: input.file,
        range: input.range,
        message: `Pi tool '${input.toolName}' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape`,
        hint: "Inline the fields at the call site: read({ path: expr, ... }).",
      },
    ];
  }

  // (3) Type-mismatch — a `.theta`-callable argument that does not type-check
  // against the callee `params:` is a parse error only when the callee is
  // statically resolvable (tool-calls.md §"Argument shape"); the
  // non-statically-resolvable arm falls to the runtime AJV check. A Pi-tool
  // argument mismatch is never a parse error — except the narrow provable
  // disjointness front-run in step (4).
  const resolution = input.staticResolution;
  if (
    (input.calleeKind === "theta-callable" || input.calleeKind === "runtime-tool") &&
    resolution !== undefined &&
    resolution.resolvable &&
    !resolution.matches
  ) {
    return [
      {
        severity: "error",
        code: "theta/parse/tool-arg-type-mismatch",
        file: input.file,
        range: input.range,
        message: `tool '${input.toolName}' argument type mismatch: expected ${resolution.expected}, got ${resolution.actual}`,
      },
    ];
  }

  // (4) Provable disjointness (RFC 0002) — a Pi-tool argument field expression
  // whose static type is provably disjoint from the schema field type (empty
  // accepted-value intersection under the schema subset) is a sound front-run of
  // a certain runtime AJV rejection. An unprovable mismatch
  // (`provablyDisjoint === false`) raises nothing here and falls through to the
  // runtime AJV check — the parse check never rejects a value AJV would accept.
  // The facts are either threaded in explicitly (`schemaConflict`) or computed
  // here from the raw static types (`schemaFieldStaticTypes`) via
  // `computeToolArgSchemaConflict`, so the real static-type × schema-subset
  // computation is reachable from this check rather than only from tests.
  const conflict = resolveSchemaConflict(input);
  if (
    input.calleeKind === "pi-tool" &&
    conflict !== undefined &&
    conflict.provablyDisjoint
  ) {
    return [
      {
        severity: "error",
        code: "theta/parse/tool-arg-schema-conflict",
        file: input.file,
        range: input.range,
        message: `Pi tool '${input.toolName}' argument field '${conflict.field}' type is provably disjoint from the input schema: expected ${conflict.expected}, got ${conflict.actual}`,
      },
    ];
  }

  return [];
}

/**
 * Resolve the provable-disjointness facts `checkToolCallArguments` step (4)
 * consumes. An explicit `schemaConflict` (the tests' facts-threading contract)
 * wins; otherwise the raw `schemaFieldStaticTypes` are reduced through the real
 * `computeToolArgSchemaConflict` static-type × schema-subset computation, and
 * the first field it proves disjoint is returned. Returning the first
 * provably-disjoint field is sound: each such field is a certain runtime AJV
 * rejection, so front-running any one of them never rejects a value AJV would
 * accept. `undefined` when neither input is present or nothing is provable.
 */
function resolveSchemaConflict(
  input: ToolCallArgCheckInput,
): ToolArgSchemaConflictFacts | undefined {
  if (input.schemaConflict !== undefined) {
    return input.schemaConflict;
  }
  const statics = input.schemaFieldStaticTypes;
  if (statics === undefined) {
    return undefined;
  }
  for (const s of statics) {
    const facts = computeToolArgSchemaConflict(s.field, s.exprType, s.schemaType);
    if (facts.provablyDisjoint) {
      return facts;
    }
  }
  return undefined;
}

// --------------------------------------------------------------------------
// Static-type × schema-subset provable-disjointness (RFC 0002)
// --------------------------------------------------------------------------

/**
 * A rendered Theta static type reduced to the set of JSON *type kinds* it can
 * accept under the [schema subset](../../docs/reference/schema-subset.md). The
 * `null` sentinel `undefined` means "not representable in the subset" — a
 * `format`, `pattern`, numeric refinement, object/array structure, or any form
 * whose accepted-value set the subset cannot enumerate as a flat kind set. When
 * either side is not representable, disjointness is NOT provable and the check
 * must fall through to the runtime AJV boundary.
 */
type SubsetKindSet = ReadonlySet<string> | undefined;

/**
 * The five scalar subset kinds a rendered type maps onto (schema-subset.md
 * §"The subset"); the subset's structural `object` / `array` types are
 * deliberately outside this set (`subsetKinds` returns `undefined` for them,
 * deferring to the runtime AJV boundary). `integer` widens into `number` for the
 * accepted-value intersection (an integer value is a valid `number`), so both
 * are retained and reconciled in `kindsDisjoint`.
 */
const SUBSET_PRIMITIVE_KINDS: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/**
 * Reduce a rendered Theta type to its subset kind set, or `undefined` when the
 * subset cannot represent it (so disjointness is unprovable). Handles the
 * primitives, `null`, and top-level `T | U` unions (each arm reduced and
 * unioned; an unrepresentable arm makes the whole union unprovable, matching
 * "a widened union with at least one satisfiable arm is not provable"). Named
 * schemas, enums, literal types, `array<T>`, object types, and any refinement
 * are treated as unrepresentable here — the runtime AJV check owns them.
 */
function subsetKinds(rendered: string): SubsetKindSet {
  // `splitTopLevelUnion` (shared with `../parser/type-layer-checks`) already
  // trims and drops empty arms; the redundant `.trim()` below is defensive.
  const arms = splitTopLevelUnion(rendered);
  const kinds = new Set<string>();
  for (const arm of arms) {
    const t = arm.trim();
    if (!SUBSET_PRIMITIVE_KINDS.has(t)) {
      // A non-primitive arm (named schema, enum, literal, array<T>, object,
      // format/pattern/refinement) is not enumerable as a flat kind here.
      return undefined;
    }
    kinds.add(t);
  }
  return kinds.size > 0 ? kinds : undefined;
}

/**
 * Whether two representable subset kind sets have empty accepted-value
 * intersection. `integer`/`number` are reconciled: an `integer` value is
 * accepted by a `number` schema and vice-versa for the intersection test, so a
 * side carrying either numeric kind intersects the other's numeric kind.
 */
function kindsDisjoint(expr: ReadonlySet<string>, schema: ReadonlySet<string>): boolean {
  const numeric = (s: ReadonlySet<string>): boolean => s.has("number") || s.has("integer");
  for (const k of expr) {
    if (schema.has(k)) {
      return false;
    }
    if ((k === "number" || k === "integer") && numeric(schema)) {
      return false;
    }
  }
  return true;
}

/**
 * The real static-type × schema-subset disjointness computation that populates
 * `ToolArgSchemaConflictFacts` (RFC 0002; tool-calls.md §"Provable-disjointness
 * check"). Returns facts with `provablyDisjoint: true` **only** when both the
 * field expression's rendered static type and the schema field type reduce to
 * representable subset kind sets whose accepted-value sets have empty
 * intersection — the sound front-run of a certain runtime AJV rejection.
 * Whenever either side is not representable in the subset (a `format`,
 * `pattern`, numeric refinement, named/enum/literal/array/object type, or a
 * union carrying such an arm), the result is `provablyDisjoint: false` and the
 * caller must defer to the runtime AJV check — the check never rejects a value
 * AJV would accept.
 */
export function computeToolArgSchemaConflict(
  field: string,
  exprType: string,
  schemaType: string,
): ToolArgSchemaConflictFacts {
  const exprKinds = subsetKinds(exprType);
  const schemaKinds = subsetKinds(schemaType);
  const provablyDisjoint =
    exprKinds !== undefined &&
    schemaKinds !== undefined &&
    kindsDisjoint(exprKinds, schemaKinds);
  return { field, provablyDisjoint, expected: schemaType, actual: exprType };
}
