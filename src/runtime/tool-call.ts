// V14a / V14a-T — the code-side `<name>(args)` tool-call dispatch/lowering seam.
//
// This module owns the runtime carriers and lowering the paired `V14a`
// implementation supplies for a code-side tool call over the theta's *callable set*
// (tool-calls.md; pi-integration-contract/host-interfaces-core.md
// §"Tool execution from theta code"):
//
// Parse-time argument checks live in `./tool-call-static-checks` and are
// re-exported here for existing callers. Runtime responsibilities:
//
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
// V14a-T (tests-task) declared these seam shapes; V14a (this leaf) supplies the
// behaviour: the `checkToolCallArguments` arity / literal / type checks, the
// closed `codeToolErrorCauses` set and the two distinct error kinds, the
// accepted-path `lowerAcceptedPiToolReturn` / `lowerAcceptedThetaCallableReturn`
// lowerings, and the `surfaceThetaCallable*Failure` `Invoke*Error` surfacings.
//
// Spec: tool-calls.md, pi-integration-contract/host-interfaces-core.md
// (§"Tool execution from theta code"), errors-and-results/queryerror-variants.md.

export {
  checkToolCallArguments,
  computeToolArgSchemaConflict,
  type ToolCallCalleeKind,
  type ToolCallStaticResolution,
  type ToolArgSchemaConflictFacts,
  type ToolCallArgCheckInput,
} from "./tool-call-static-checks";

import { makeErr, makeOk, type ThetaValue, type ResultValue } from "./value";
import {
  depthWalk,
  DEPTH_VIOLATION_MESSAGE,
  type DepthViolationIssue,
} from "./depth-walk";
import { wireFormDepthWalk } from "./wire-form-depth-walk";
import type {
  CodeToolCause,
  CodeToolError,
  InvokeCalleeError,
  InvokeInfraError,
  QueryError,
} from "./query-error";
import type { ValidationError } from "../seams/schema-validator";

// --------------------------------------------------------------------------
// Bug 0003 — runtime belt-and-braces behind the parse-time shape gate
// --------------------------------------------------------------------------

/**
 * Bug 0003 (docs/bugs/0003-tool-arg-shape-rule-not-enforced.md) belt-and-braces:
 * a Pi-tool call whose first argument is not an inline object literal is
 * rejected at parse time (`theta/parse/tool-arg-not-object-literal`, the shape
 * rule in `checkToolCallArguments`), so one reaching a runtime lowering means the parse gate did not
 * reject this call site — a genuine gap in the gate. A lexically shadowed
 * callee never reaches this throw: bug 0016 rejects such call sites at parse
 * (`theta/parse/shadowed-callable-call`) and both lowerings guard the
 * shadowed callee with `ShadowedCalleeDispatchDefectError` BEFORE the shape
 * test below runs. Lowering to `{}` / `args: undefined` silently drops the
 * author's argument object and misattributes the failure to the tool — the
 * 0.12.0 defect — so both lowerings (`preEvaluateToolArgs`,
 * `lowerToolCallParams`) throw this instead: a thrown Error routed to the
 * `theta/runtime/internal-error` surface (the `ThetaFnArityError` /
 * `ToolReturnShapeDefectError` pattern), so the gap fails loudly instead of
 * arg-dropping. Zero-argument calls are NOT defects (parse admits `read()`;
 * both lowerings keep degrading them to `{}`).
 */
export class PiToolArgShapeDefectError extends Error {
  public constructor(toolName: string) {
    super(
      `internal defect: Pi tool '${toolName}' call reached the runtime lowering with a non-object-literal first argument; the parse-time shape gate (theta/parse/tool-arg-not-object-literal) did not reject this call site — a gate gap (bug 0003)`,
    );
    this.name = "PiToolArgShapeDefectError";
  }
}

/**
 * Bug 0016 (docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md)
 * belt-and-braces: a call whose callee is a callable-set name lexically
 * shadowed by a local binding is rejected at parse time
 * (`theta/parse/shadowed-callable-call` — expressions.md §Identifier
 * resolution ranks the local arm first and locals are never callable), so one
 * reaching a runtime lowering means the parse gate did not reject this call
 * site. Dispatching anyway would execute the callable at a call site that does
 * not denote it (the 0016 defect: runtime classification was
 * callable-set-membership only and never consulted the lexical environment),
 * so both lowerings (`preEvaluateToolArgs`, `lowerToolCallParams`) throw this
 * BEFORE any argument handling: a thrown Error routed to the
 * `theta/runtime/internal-error` surface exactly as `PiToolArgShapeDefectError`
 * above (a plain Error caught by the top-level slash runtime-defect surface
 * and framed via `surfaceUnexpectedThrow`). The guard keys on
 * `LexicalEnvironment.localShadowsCallable` — callable-set membership AND an
 * arm-1 local within the current `fn` activation — so a user-`fn` callee (arm
 * "fn"/"import", intercepted by `resolveUserFn` before the effect path), an
 * unshadowed callable (arm "callable"), and a non-colliding local callee (arm
 * "local" but not a callable-set name) never hit it.
 */
export class ShadowedCalleeDispatchDefectError extends Error {
  public constructor(calleeName: string) {
    super(
      `internal defect: call of '${calleeName}' reached the runtime lowering although the call site lexically resolves to a local binding that shadows the callable-set entry '${calleeName}'; dispatching the callable would execute code the site does not denote — the parse gate (theta/parse/shadowed-callable-call) rejects this call site, so reaching here is a gate gap (bug 0016)`,
    );
    this.name = "ShadowedCalleeDispatchDefectError";
  }
}

// --------------------------------------------------------------------------
// `CodeToolError` closed enum + distinctness from `ModelToolError`
// --------------------------------------------------------------------------

/**
 * The closed `CodeToolError.cause` enum, in declaration order
 * (queryerror-variants.md): `validation` / `execution` / `cancelled` /
 * `unknown_tool`. This is the contract surface for theta authors — it is **not**
 * widened to cover every observable `execute()` disposition.
 */
export function codeToolErrorCauses(): readonly CodeToolCause[] {
  return ["validation", "execution", "cancelled", "unknown_tool"];
}

/**
 * The `kind` wire discriminator of `CodeToolError` (`"code_tool"`).
 */
export function codeToolErrorKind(): string {
  return "code_tool";
}

/**
 * The `kind` wire discriminator of `ModelToolError` (`"model_tool"`) — a
 * *distinct* variant from `CodeToolError`: a code-side call carries a structured
 * `cause` enum and no `tool_call_id` / `raw_response`, whereas `ModelToolError` —
 * the reserved model-loop adapter-failure variant — carries both and no `cause`.
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
 */
export function lowerAcceptedPiToolReturn(finalOutput: string): ResultValue {
  return makeOk(finalOutput);
}

/**
 * Lower a conforming subagent-mode `.theta`-callable return to the theta 1.0
 * `Result<T, QueryError>` accepted value: `Ok(<payload>)`, carrying the
 * callee's inferred (statically resolved) or AJV-enforced return payload
 * (tool-calls.md §"Return type", registered-theta row).
 */
export function lowerAcceptedThetaCallableReturn(payload: ThetaValue): ResultValue {
  return makeOk(payload);
}

// --------------------------------------------------------------------------
// V14e / V14e-T — ceiling-#4 depth-6 code-driven-tool-args live carrier.
//
// The delegated live-carrier witness for the code-driven-tool-args ceiling-#4
// routing row (ceilings-3-and-4.md#ceiling-4-table). The `<name>(args)`
// argument is the interpreter's OWN value, not parsed JSON, so a depth-6
// code-driven argument trips `wireFormDepthWalk` (`./wire-form-depth-walk.ts`)
// — the walk over the payload's WIRE FORM, the JSON document `JSON.stringify`
// writes for it (schema-subset.md:13, :22, :24–30; bug 0202) — before AJV runs
// (CIO-3), and surfaces wrapped as `Err(CodeToolError { cause: "validation",
// ... })`, building on the `V14a` `CodeToolError` carrier. A within-cap
// argument produces no depth breach and falls through to the downstream AJV
// boundary (owned elsewhere). Its sibling `enforceModelToolArgDepth` below
// deliberately keeps `depth-walk.ts`'s `depthWalk`: every one of its call
// sites is handed a model-produced argument document — already-parsed JSON,
// where a boxed `String` cannot occur.
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
 * Enforce ceiling #4 at the code-driven `<name>(args)` argument boundary: the
 * argument is the interpreter's OWN value, so this runs `wireFormDepthWalk`
 * over its WIRE FORM *before* AJV (CIO-3), and — on a depth-6+ breach —
 * surface it wrapped as
 * `Err(CodeToolError { cause: "validation", ... })` per the code-driven row of
 * the ceiling-#4 per-boundary table (ceilings-3-and-4.md#ceiling-4-table).
 * Returns `undefined` for a within-cap argument, deferring to the downstream
 * AJV boundary.
 *
 * The wire-form walk runs before AJV (CIO-3): a within-cap value yields
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
  const walk = wireFormDepthWalk(argValue);
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
// Bug 0072 §Fix, runtime half — pre-dispatch AJV rejection of a code-side
// Pi-tool call's constructed argument object against the tool's registered
// `parameters` schema.
// --------------------------------------------------------------------------

/**
 * A pre-dispatch AJV rejection of a code-side Pi-tool call's constructed
 * argument object against the tool's registered `parameters` schema (bug 0072
 * §Fix runtime half; tool-calls.md §"Argument shape": "a Pi-tool argument that does not
 * match the tool's input schema … surfaces at runtime as
 * `Err(CodeToolError { cause: "validation", ... })`"). Same shape as
 * `CodeToolArgDepthBreach` above — `result` is the wrapped `Err`, `error` is
 * the carrier itself — so both `cause: "validation"` producers compose
 * identically at their call site.
 */
export interface CodeToolArgSchemaViolation {
  readonly result: ResultValue;
  readonly error: CodeToolError;
}

/**
 * Build the `Err(CodeToolError { cause: "validation" })` carrier for a
 * pre-dispatch AJV rejection, from a failed `CompiledValidator.validate(...)`
 * verdict's `errors`. Constructed beside `enforceCodeToolArgDepth` so
 * `cause: "validation"`'s two code-side producers — the depth ceiling and this
 * schema check — share one owning module; the AJV compile+validate call itself
 * runs at the dispatch site (`#resolveToolCall`,
 * src/extension/production-theta-producer.ts), which holds the injected
 * `SchemaValidator` seam this module has no dependency on. The message renders
 * each AJV failure as `<instancePath> <message>`, joined with `"; "` — the
 * same `<path> <message>` form the QRY-12 `<ajv-summary>` placeholder uses.
 */
export function buildCodeToolArgSchemaViolation(
  toolName: string,
  errors: readonly ValidationError[],
): CodeToolArgSchemaViolation {
  const error: CodeToolError = {
    kind: "code_tool",
    message: errors.map((e) => `${e.instancePath} ${e.message}`.trim()).join("; "),
    tool_name: toolName,
    cause: "validation",
  };
  return { result: makeErr(error as unknown as ThetaValue), error };
}

// --------------------------------------------------------------------------
// Bug 0322 §Fix (settled route: mint-at-the-seam) — the dispatch-time
// snapshot-miss safety net for `cause: "unknown_tool"`.
// --------------------------------------------------------------------------

/**
 * Build the `Err(CodeToolError { cause: "unknown_tool" })` carrier for a
 * code-side call whose callee name the frozen callable-set snapshot does not
 * hold at dispatch (`#resolveToolCall`'s regime-inactive `tool === undefined`
 * arm, `src/extension/production-theta-producer.ts`). This is the sole
 * producer of `unknown_tool` (bug 0322): a registered theta cannot reach it
 * (load-time admission freezes every `tools:` name into the snapshot; a
 * reload rebuild that drops a tool is refused registration at load, per
 * `theta/load/unknown-tool`), so it is harness-only-reachable — but any input
 * that does reach it gets the truthful cause instead of the `execution`
 * mis-attribution a throw-based rejection would lower to. Same shape as
 * `CodeToolArgSchemaViolation` above (`result` the wrapped `Err`, `error` the
 * carrier itself) so both compose identically at their call site.
 */
export function buildCodeToolUnknownTool(toolName: string): CodeToolArgSchemaViolation {
  const error: CodeToolError = {
    kind: "code_tool",
    message: `code-side call names no resolvable host tool '${toolName}'`,
    tool_name: toolName,
    cause: "unknown_tool",
  };
  return { result: makeErr(error as unknown as ThetaValue), error };
}

// --------------------------------------------------------------------------
// Ceiling-#4 depth-6 MODEL-DRIVEN tool-args carrier (the `@`-query loop's
// `tool_use` args row).
//
// Distinct from the code-driven carrier above: the model-driven row of the
// ceiling-#4 per-boundary table (ceilings-3-and-4.md#ceiling-4-table;
// schema-subset.md §Depth Enforcement point #2) routes to *the model*, NOT to
// theta code. A depth-6 model-produced argument does NOT surface as a theta
// `Err` and specifically NOT as `ModelToolError` (a reserved variant with no
// theta 1.0-reachable producer); it is materialised as a tool-error result fed back
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
