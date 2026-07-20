// V14a / V14a-T — the code-side `<name>(args)` tool-call dispatch/lowering seam.
//
// This module owns the interpreter-side seam the paired `V14a` implementation
// leaf fills in for a code-side tool call over the theta's *callable set*
// (tool-calls.md; pi-integration-contract/host-interfaces-core.md
// §"Tool execution from theta code"):
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
//   - The closed `CodeToolError.cause` enum surface
//     (`validation` / `execution` / `cancelled` / `unknown_tool`) and its
//     distinctness from `ModelToolError` — the two `QueryError` variants carry
//     different `kind` wire tags (`"code_tool"` vs `"model_tool"`).
//   - The accepted-path return lowering: a conforming Pi-tool return lowers to
//     `Ok(string)` (the tool's final output as a single string); a conforming
//     subagent-mode `.theta`-callable return lowers to `Ok(T)` (the callee's
//     inferred / AJV-enforced return payload).
//   - The `.theta`-callable failure surface: failures cascade through
//     `InvokeCalleeError` / `InvokeInfraError`, with an input-validation
//     failure surfacing as `InvokeInfraError { cause: "validation", ... }`
//     (the same `invoke`-shaped arm), never as a `CodeToolError`.
//
// The accepted-path `execute()` envelope-lowering *mechanics* (content-block
// filtering / joining, the four off-surface dispositions), the `cka-47`
// tool-call checkpoint facet, and the `ERR-13` completed-callee-finality
// witness are owned by the paired `V14g` leaf and are out of scope here.
//
// V14a-T (tests-task) declares these seam shapes and stubs every
// behaviour-bearing function inertly:
//   - `checkToolCallArguments` returns no diagnostics (so the arity, not-literal,
//     type-mismatch, and arity-before-type assertions all red),
//   - `codeToolErrorCauses` returns the empty set and `codeToolErrorKind` /
//     `modelToolErrorKind` return `""` (so the closed-enum and distinctness
//     assertions red),
//   - `lowerAcceptedPiToolReturn` / `lowerAcceptedThetaCallableReturn` return an
//     inert `Err(null)` (so both accepted-path `Ok` assertions red),
//   - `surfaceThetaCallableInputValidationFailure` /
//     `surfaceThetaCallableCalleeFailure` return inert `kind: ""` values (so the
//     `Invoke*Error` surfacing assertions red).
// Each paired V14a-T test reds on its own primary assertion, not on a compile
// error, a missing fixture, or a harness throw. The paired V14a implementation
// leaf fills these in.
//
// Spec: tool-calls.md, pi-integration-contract/host-interfaces-core.md
// (§"Tool execution from theta code"), errors-and-results/queryerror-variants.md.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { isBareObjectLiteral } from "../parser/literal-sublanguage";
// RFC 0002: reuse the single top-level-union splitter (the schema-subset
// disjointness reduction below and the type-layer checks must agree on arm
// boundaries); a duplicate previously lived here and was removed.
import { splitTopLevelUnion } from "../parser/type-layer-checks";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "./value";
import {
  depthWalk,
  DEPTH_VIOLATION_MESSAGE,
  type DepthViolationIssue,
} from "./depth-walk";
import type {
  CodeToolCause,
  CodeToolError,
  InvokeCalleeError,
  InvokeInfraError,
  QueryError,
} from "./query-error";

// --------------------------------------------------------------------------
// Parse-time argument checks (arity → not-literal → type; arity before type)
// --------------------------------------------------------------------------

/** Which callee kind a code-side `<name>(args)` call resolves to. */
export type ToolCallCalleeKind = "pi-tool" | "theta-callable";

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
 *
 * V14a-T stubs this as an inert no-op (returns no diagnostics), so every
 * argument-check assertion reds on its own primary assertion. The paired V14a
 * implementation leaf fills in the three checks and their ordering.
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
    input.calleeKind === "theta-callable" &&
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
 * The seven subset scalar/structural kinds a rendered type maps onto
 * (schema-subset.md §"The subset"). `integer` widens into `number` for the
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

// --------------------------------------------------------------------------
// `CodeToolError` closed enum + distinctness from `ModelToolError`
// --------------------------------------------------------------------------

/**
 * The closed `CodeToolError.cause` enum, in declaration order
 * (queryerror-variants.md): `validation` / `execution` / `cancelled` /
 * `unknown_tool`. This is the contract surface for theta authors — it is **not**
 * widened to cover every observable `execute()` disposition.
 *
 * V14a-T stubs this to the empty set so the closed-enum assertion reds.
 */
export function codeToolErrorCauses(): readonly CodeToolCause[] {
  return ["validation", "execution", "cancelled", "unknown_tool"];
}

/**
 * The `kind` wire discriminator of `CodeToolError` (`"code_tool"`).
 *
 * V14a-T stubs this to `""` so the distinctness assertion reds.
 */
export function codeToolErrorKind(): string {
  return "code_tool";
}

/**
 * The `kind` wire discriminator of `ModelToolError` (`"model_tool"`) — a
 * *distinct* variant from `CodeToolError`: a code-side call carries a structured
 * `cause` enum and no `tool_call_id` / `raw_response`, whereas the model-loop
 * adapter failure carries both and no `cause`.
 *
 * V14a-T stubs this to `""` so the distinctness assertion reds.
 */
export function modelToolErrorKind(): string {
  return "model_tool";
}

// --------------------------------------------------------------------------
// Accepted-path return lowering (Pi tool → Ok(string); `.theta` → Ok(T))
// --------------------------------------------------------------------------

/**
 * Lower a conforming Pi-tool return to the theta 1.0 `Result<string, QueryError>`
 * accepted value: `Ok(<final output>)`, carrying the tool's final output as a
 * single `string` (tool-calls.md §"Return type", Pi-tool row). The
 * content-block filtering / joining that *produces* `finalOutput` from the
 * `AgentToolResult` envelope is owned by the paired `V14g` leaf.
 *
 * V14a-T stubs this to an inert `Err(null)` so the accepted-path `Ok(string)`
 * assertion reds.
 */
export function lowerAcceptedPiToolReturn(finalOutput: string): ResultValue {
  return makeOk(finalOutput);
}

/**
 * Lower a conforming subagent-mode `.theta`-callable return to the theta 1.0
 * `Result<T, QueryError>` accepted value: `Ok(<payload>)`, carrying the
 * callee's inferred (statically resolved) or AJV-enforced return payload
 * (tool-calls.md §"Return type", registered-theta row).
 *
 * V14a-T stubs this to an inert `Err(null)` so the accepted-path `Ok(T)`
 * assertion reds.
 */
export function lowerAcceptedThetaCallableReturn(payload: ThetaValue): ResultValue {
  return makeOk(payload);
}

// --------------------------------------------------------------------------
// V14e / V14e-T — ceiling-#4 depth-6 code-driven-tool-args live carrier.
//
// The delegated live-carrier witness for `V5e`'s code-driven-tool-args
// ceiling-#4 routing row (ceilings-3-and-4.md#ceiling-4-table). A depth-6
// code-driven `<name>(args)` argument trips the theta-owned depth walk (`V5e`,
// `depthWalk`) *before* AJV runs (CIO-3) and surfaces wrapped as
// `Err(CodeToolError { cause: "validation", ... })`, building on the `V14a`
// `CodeToolError` carrier. A within-cap argument produces no depth breach and
// falls through to the downstream AJV boundary (owned elsewhere).
// --------------------------------------------------------------------------

/**
 * A depth-6 code-driven-tool-args ceiling-#4 breach, materialised at the
 * `<name>(args)` site (ceilings-3-and-4.md#ceiling-4-table, code-driven row):
 *
 *   - `result` — the wrapped `Err(CodeToolError { cause: "validation", ... })`
 *     surfaced to theta code, matching the per-boundary table's code-driven row;
 *   - `error`  — the `CodeToolError` carrier itself (`kind: "code_tool"`,
 *     `cause: "validation"`, canonical depth `message`, post-rename `tool_name`);
 *   - `issue`  — the theta-owned depth walk's `ValidationIssue`, carrying
 *     `schema_keyword: "maxDepth"` and the canonical
 *     `"JSON document depth exceeds 5"` message.
 */
export interface CodeToolArgDepthBreach {
  readonly result: ResultValue;
  readonly error: CodeToolError;
  readonly issue: DepthViolationIssue;
}

/**
 * Enforce ceiling #4 at the code-driven `<name>(args)` argument boundary: run
 * `V5e`'s theta-owned depth walk over the materialised argument value *before*
 * AJV (CIO-3), and — on a depth-6+ breach — surface it wrapped as
 * `Err(CodeToolError { cause: "validation", ... })` per the code-driven row of
 * the ceiling-#4 per-boundary table (ceilings-3-and-4.md#ceiling-4-table).
 * Returns `undefined` for a within-cap argument, deferring to the downstream
 * AJV boundary.
 *
 * The depth walk (`V5e`) runs before AJV (CIO-3): a within-cap value yields
 * `{ ok: true }` and this returns `undefined`, deferring to the downstream AJV
 * check; a depth-6+ value yields the canonical depth-violation issue
 * (`schema_keyword: "maxDepth"`, message `"JSON document depth exceeds 5"`),
 * which is wrapped into the `CodeToolError` carrier (`V14a`) with
 * `cause: "validation"` and surfaced as `Err(CodeToolError)` to theta code, per
 * the code-driven row of the ceiling-#4 per-boundary table
 * (ceilings-3-and-4.md#ceiling-4-table).
 */
export function enforceCodeToolArgDepth(
  toolName: string,
  argValue: unknown,
): CodeToolArgDepthBreach | undefined {
  const walk = depthWalk(argValue);
  if (walk.ok) {
    // Within the depth cap — no ceiling-#4 breach at this site; defer to the
    // downstream AJV boundary (owned elsewhere).
    return undefined;
  }

  // Depth-6+ breach: wrap the canonical depth-violation into the `V14a`
  // `CodeToolError` carrier with `cause: "validation"`. The carrier's own
  // `message` is the canonical depth-violation string (the same string the
  // depth walk's issue carries), anchored to schema-subset.md §Error shape.
  const error: CodeToolError = {
    kind: "code_tool",
    message: DEPTH_VIOLATION_MESSAGE,
    tool_name: toolName,
    cause: "validation",
  };
  return {
    result: makeErr(error as unknown as ThetaValue),
    error,
    issue: walk.issue,
  };
}

// --------------------------------------------------------------------------
// Ceiling-#4 depth-6 MODEL-DRIVEN tool-args carrier (the `@`-query loop's
// `tool_use` args row).
//
// Distinct from the code-driven carrier above: the model-driven row of the
// ceiling-#4 per-boundary table (ceilings-3-and-4.md#ceiling-4-table;
// schema-subset.md §Depth Enforcement point #2) routes to *the model*, NOT to
// theta code. A depth-6 model-produced argument does NOT surface as a theta
// `Err` and specifically NOT as `ModelToolError` (reserved for non-recoverable
// adapter-layer failures); it is materialised as a tool-error result fed back
// to the model as the next turn, the round still counts against
// `tool_loop.max_rounds`, and the loop continues (re-trying naturally on the
// model's next turn). No `QueryError` reaches theta code unless the loop later
// exhausts under ceiling #2.
//
// AJV against the presented tool schema cannot catch this: JSON Schema 2020-12
// has no `maxDepth` keyword, so the lowered/presented schema carries no depth
// bound (schema-subset.md §Depth Enforcement) — the same reason the code-driven
// and invoke paths need an explicit walk. Hence this theta-owned walk runs
// *before* the tool body (CIO-3) at the model-driven dispatch seam.
// --------------------------------------------------------------------------

/**
 * A depth-6 MODEL-DRIVEN tool-args ceiling-#4 breach, materialised at the
 * model-driven `tool_use` dispatch seam (ceilings-3-and-4.md#ceiling-4-table,
 * model-driven row):
 *
 *   - `issue`   — the theta-owned depth walk's `ValidationIssue`, carrying
 *     `schema_keyword: "maxDepth"` and the canonical
 *     `"JSON document depth exceeds 5"` message with the RFC-6901 JSON Pointer
 *     to the first too-deep node;
 *   - `message` — the text materialised in the tool-error result fed back to
 *     the model: the canonical depth message, prefixed with the JSON Pointer to
 *     the offending argument node when it is not the root, so the model can
 *     locate and shrink the over-deep argument on its natural in-loop retry.
 *
 * Deliberately carries NO `Err`/`CodeToolError`/`ModelToolError` — the surface
 * is a model-facing tool-result, not a theta-code `Result`.
 */
export interface ModelToolArgDepthBreach {
  readonly issue: DepthViolationIssue;
  readonly message: string;
}

/**
 * Enforce ceiling #4 at the MODEL-DRIVEN `tool_use` argument boundary: run
 * `V5e`'s theta-owned depth walk over the model-produced argument value *before*
 * the tool body runs (CIO-3), and — on a depth-6+ breach — return the
 * model-facing carrier the dispatch seam feeds back to the model as a
 * tool-error result per the model-driven row of the ceiling-#4 per-boundary
 * table (ceilings-3-and-4.md#ceiling-4-table). Returns `undefined` for a
 * within-cap argument, deferring to the tool body / downstream provider
 * validation.
 *
 * Unlike `enforceCodeToolArgDepth`, this produces no theta `Err`: the model-
 * driven row's destination is the model (the loop continues, the round counts
 * against `tool_loop.max_rounds`), so the breach carries only the model-facing
 * feedback text and the canonical depth issue.
 */
export function enforceModelToolArgDepth(
  argValue: unknown,
): ModelToolArgDepthBreach | undefined {
  const walk = depthWalk(argValue);
  if (walk.ok) {
    // Within the depth cap — no ceiling-#4 breach at this site; defer to the
    // tool body / downstream provider validation.
    return undefined;
  }

  // Depth-6+ breach: materialise the model-facing feedback. Prefix the
  // canonical message with the JSON Pointer to the offending node (matching the
  // slash-load row's `<JSON-Pointer> JSON document depth exceeds 5` form) so
  // the model can shrink that argument on its natural in-loop retry; a
  // root-level breach (empty pointer) feeds the bare canonical message.
  const message =
    walk.issue.path === ""
      ? DEPTH_VIOLATION_MESSAGE
      : `${walk.issue.path} ${DEPTH_VIOLATION_MESSAGE}`;
  return { issue: walk.issue, message };
}

// --------------------------------------------------------------------------
// `.theta`-callable failure surface (Invoke*Error, never CodeToolError)
// --------------------------------------------------------------------------

/**
 * Surface an input-side argument-validation failure of a `.theta`-callable call
 * (when the callee is not statically resolvable, so the parse-time
 * `theta/parse/tool-arg-type-mismatch` check did not fire) as
 * `Err(InvokeInfraError { cause: "validation", ... })` — the same `invoke`-shaped
 * arm `invoke(...)` uses for input validation, and **distinct** from a
 * `CodeToolError` (tool-calls.md §"Failures").
 *
 * V14a-T stubs this to an inert value whose `kind` is `""` and whose `cause` is
 * `"load_failure"`, so the `InvokeInfraError { cause: "validation" }` assertion
 * reds.
 */
export function surfaceThetaCallableInputValidationFailure(
  calleePath: string,
  message: string,
): InvokeInfraError {
  return {
    kind: "invoke_infra",
    message,
    callee_path: calleePath,
    cause: "validation",
  };
}

/**
 * Surface a failure the `.theta` callee itself returned as
 * `Err(InvokeCalleeError { inner, ... })` — the call is semantically an
 * `invoke`, so a callee-returned `Err` cascades through `InvokeCalleeError`
 * carrying the callee's original `QueryError` as `inner` (tool-calls.md
 * §"Failures"). `CodeToolError` arises for a `.theta` callable only in the
 * `"unknown_tool"` safety-net case.
 *
 * V14a-T stubs this to an inert value whose `kind` is `""`, so the
 * `InvokeCalleeError` surfacing assertion reds.
 */
export function surfaceThetaCallableCalleeFailure(
  calleePath: string,
  inner: QueryError,
  message: string,
): InvokeCalleeError {
  return {
    kind: "invoke_callee",
    message,
    callee_path: calleePath,
    inner,
  };
}
