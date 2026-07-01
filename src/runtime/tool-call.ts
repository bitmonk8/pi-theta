// V14a / V14a-T — the code-side `<name>(args)` tool-call dispatch/lowering seam.
//
// This module owns the interpreter-side seam the paired `V14a` implementation
// leaf fills in for a code-side tool call over the loom's *callable set*
// (tool-calls.md; pi-integration-contract/host-interfaces-core.md
// §"Tool execution from loom code"):
//
//   - The parse-time argument checks with the arity-before-type ordering:
//     `loom/parse/tool-arg-arity` (a multi-argument Pi-tool call), then
//     `loom/parse/tool-arg-not-literal` (the single positional argument is not
//     a literal-sublanguage form), then `loom/parse/tool-arg-type-mismatch`
//     (a statically-resolvable `.loom`-callable argument that does not match
//     the callee's `params:`). Arity is checked before type: a call that both
//     over-supplies positional arguments and type-mismatches fires only the
//     arity code.
//   - The closed `CodeToolError.cause` enum surface
//     (`validation` / `execution` / `cancelled` / `unknown_tool`) and its
//     distinctness from `ModelToolError` — the two `QueryError` variants carry
//     different `kind` wire tags (`"code_tool"` vs `"model_tool"`).
//   - The accepted-path return lowering: a conforming Pi-tool return lowers to
//     `Ok(string)` (the tool's final output as a single string); a conforming
//     subagent-mode `.loom`-callable return lowers to `Ok(T)` (the callee's
//     inferred / AJV-enforced return payload).
//   - The `.loom`-callable failure surface: failures cascade through
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
//   - `lowerAcceptedPiToolReturn` / `lowerAcceptedLoomCallableReturn` return an
//     inert `Err(null)` (so both accepted-path `Ok` assertions red),
//   - `surfaceLoomCallableInputValidationFailure` /
//     `surfaceLoomCallableCalleeFailure` return inert `kind: ""` values (so the
//     `Invoke*Error` surfacing assertions red).
// Each paired V14a-T test reds on its own primary assertion, not on a compile
// error, a missing fixture, or a harness throw. The paired V14a implementation
// leaf fills these in.
//
// Spec: tool-calls.md, pi-integration-contract/host-interfaces-core.md
// (§"Tool execution from loom code"), errors-and-results/queryerror-variants.md.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { checkLiteralSublanguage } from "../parser/literal-sublanguage";
import { makeErr, makeOk, type LoomValue, type ResultValue } from "./value";
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
export type ToolCallCalleeKind = "pi-tool" | "loom-callable";

/**
 * The static-resolution facts a `.loom`-callable argument type-mismatch check
 * consumes (tool-calls.md §"Argument shape"). Type-mismatch is a parse error
 * only for a `.loom` callee that is *statically resolvable*; a Pi-tool argument
 * mismatch is never a parse error (it surfaces at runtime as
 * `Err(CodeToolError { cause: "validation", ... })`).
 */
export interface ToolCallStaticResolution {
  /** Whether the `.loom` callee is statically resolvable per invocation.md. */
  readonly resolvable: boolean;
  /** Whether the argument type-checks against the callee's `params:`. */
  readonly matches: boolean;
  /** Rendered expected type, for the `<expected>` placeholder. */
  readonly expected: string;
  /** Rendered actual type, for the `<actual>` placeholder. */
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
   * arity already failed or the call is a `.loom`-callable call.
   */
  readonly argumentSource?: string;
  /** Static-resolution facts for a `.loom`-callable type-mismatch check. */
  readonly staticResolution?: ToolCallStaticResolution;
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * Run the parse-time argument checks for a code-side `<name>(args)` call,
 * returning every diagnostic raised. The checks run in order — arity, then
 * not-literal, then type-mismatch — and **arity is checked before type**: a
 * call that both over-supplies positional arguments and type-mismatches fires
 * only `loom/parse/tool-arg-arity`, not `loom/parse/tool-arg-type-mismatch`.
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
  // `loom/parse/tool-arg-arity` regardless of the argument shapes). An
  // over-supplied positional count short-circuits before any type check, so a
  // call that both over-supplies arguments and type-mismatches fires only the
  // arity code.
  if (input.positionalCount > 1) {
    return [
      {
        severity: "error",
        code: "loom/parse/tool-arg-arity",
        file: input.file,
        range: input.range,
        message: `Pi tool '${input.toolName}' takes a single object argument; got ${input.positionalCount}`,
      },
    ];
  }

  // (2) Not-literal — the single positional Pi-tool argument must be a
  // literal-sublanguage form (tool-calls.md §"Argument shape"). Reuse the
  // shared is-literal check (V2a), which reports `loom/parse/tool-arg-not-literal`
  // at the `tool-arg` position and names the offending sub-expression.
  if (input.calleeKind === "pi-tool" && input.argumentSource !== undefined) {
    const litDiags = checkLiteralSublanguage(input.argumentSource, "tool-arg", {
      file: input.file,
      range: input.range,
    });
    if (litDiags.length > 0) {
      return litDiags;
    }
  }

  // (3) Type-mismatch — a `.loom`-callable argument that does not type-check
  // against the callee `params:` is a parse error only when the callee is
  // statically resolvable (tool-calls.md §"Argument shape"); the
  // non-statically-resolvable arm falls to the runtime AJV check. A Pi-tool
  // argument mismatch is never a parse error.
  const resolution = input.staticResolution;
  if (
    input.calleeKind === "loom-callable" &&
    resolution !== undefined &&
    resolution.resolvable &&
    !resolution.matches
  ) {
    return [
      {
        severity: "error",
        code: "loom/parse/tool-arg-type-mismatch",
        file: input.file,
        range: input.range,
        message: `tool '${input.toolName}' argument type mismatch: expected ${resolution.expected}, got ${resolution.actual}`,
      },
    ];
  }

  return [];
}

// --------------------------------------------------------------------------
// `CodeToolError` closed enum + distinctness from `ModelToolError`
// --------------------------------------------------------------------------

/**
 * The closed `CodeToolError.cause` enum, in declaration order
 * (queryerror-variants.md): `validation` / `execution` / `cancelled` /
 * `unknown_tool`. This is the contract surface for loom authors — it is **not**
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
// Accepted-path return lowering (Pi tool → Ok(string); `.loom` → Ok(T))
// --------------------------------------------------------------------------

/**
 * Lower a conforming Pi-tool return to the loom 1.0 `Result<string, QueryError>`
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
 * Lower a conforming subagent-mode `.loom`-callable return to the loom 1.0
 * `Result<T, QueryError>` accepted value: `Ok(<payload>)`, carrying the
 * callee's inferred (statically resolved) or AJV-enforced return payload
 * (tool-calls.md §"Return type", registered-loom row).
 *
 * V14a-T stubs this to an inert `Err(null)` so the accepted-path `Ok(T)`
 * assertion reds.
 */
export function lowerAcceptedLoomCallableReturn(payload: LoomValue): ResultValue {
  return makeOk(payload);
}

// --------------------------------------------------------------------------
// V14e / V14e-T — ceiling-#4 depth-6 code-driven-tool-args live carrier.
//
// The delegated live-carrier witness for `V5e`'s code-driven-tool-args
// ceiling-#4 routing row (ceilings-3-and-4.md#ceiling-4-table). A depth-6
// code-driven `<name>(args)` argument trips the loom-owned depth walk (`V5e`,
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
 *     surfaced to loom code, matching the per-boundary table's code-driven row;
 *   - `error`  — the `CodeToolError` carrier itself (`kind: "code_tool"`,
 *     `cause: "validation"`, canonical depth `message`, post-rename `tool_name`);
 *   - `issue`  — the loom-owned depth walk's `ValidationIssue`, carrying
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
 * `V5e`'s loom-owned depth walk over the materialised argument value *before*
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
 * `cause: "validation"` and surfaced as `Err(CodeToolError)` to loom code, per
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
    result: makeErr(error as unknown as LoomValue),
    error,
    issue: walk.issue,
  };
}

// --------------------------------------------------------------------------
// `.loom`-callable failure surface (Invoke*Error, never CodeToolError)
// --------------------------------------------------------------------------

/**
 * Surface an input-side argument-validation failure of a `.loom`-callable call
 * (when the callee is not statically resolvable, so the parse-time
 * `loom/parse/tool-arg-type-mismatch` check did not fire) as
 * `Err(InvokeInfraError { cause: "validation", ... })` — the same `invoke`-shaped
 * arm `invoke(...)` uses for input validation, and **distinct** from a
 * `CodeToolError` (tool-calls.md §"Failures").
 *
 * V14a-T stubs this to an inert value whose `kind` is `""` and whose `cause` is
 * `"load_failure"`, so the `InvokeInfraError { cause: "validation" }` assertion
 * reds.
 */
export function surfaceLoomCallableInputValidationFailure(
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
 * Surface a failure the `.loom` callee itself returned as
 * `Err(InvokeCalleeError { inner, ... })` — the call is semantically an
 * `invoke`, so a callee-returned `Err` cascades through `InvokeCalleeError`
 * carrying the callee's original `QueryError` as `inner` (tool-calls.md
 * §"Failures"). `CodeToolError` arises for a `.loom` callable only in the
 * `"unknown_tool"` safety-net case.
 *
 * V14a-T stubs this to an inert value whose `kind` is `""`, so the
 * `InvokeCalleeError` surfacing assertion reds.
 */
export function surfaceLoomCallableCalleeFailure(
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
