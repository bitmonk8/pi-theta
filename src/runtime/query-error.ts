// V4d / V4d-T — the `QueryError` variant schema seam.
//
// This module owns the interpreter-side declaration of `QueryError` and every
// variant it carries, plus the small pure helpers the runtime needs to produce
// canonically-shaped error values:
//
//   - The nine-variant `QueryError` union and its `ValidationIssue` /
//     `ValidationError` shapes (queryerror-variants.md §"QueryError variants").
//   - ERR-14 — the canonical `ValidationIssue` ordering (stable ascending sort
//     on the tuple (path, schema_keyword, message), each field compared by
//     Unicode code point).
//   - ERR-15 — the discriminator type-openness seam: `kind` is typed `string`
//     at the type-system level, not a closed enum of the nine theta 1.0.0 tags;
//     the runtime never emits an unlisted `kind`, exposed here as the closed
//     conformance set.
//   - ERR-17 — the forced-respond non-compliance synthesised `ValidationIssue`
//     (path `""`, schema_keyword `"required"`, branch-specific two-arm message).
//   - ERR-19 — the `ToolLoopExhaustedError` shape (`rounds == max_rounds`).
//
// V4d-T (tests-task) declared the seam shapes and stubbed the behaviour-bearing
// helpers inertly so the failing tests compiled and redded on their own primary
// assertions; the paired V4d implementation leaf fills in the canonical
// ordering, the closed conformance set, the synthesised issue's contract
// strings, and the exhaustion-error shape.
//
// Spec: errors-and-results/queryerror-variants.md, errors-and-results/error-model.md.

// --- ValidationIssue / ValidationError -------------------------------------

/**
 * A single schema-validation failure, isolated from the raw AJV object so a
 * future validator swap is not a breaking change (queryerror-variants.md
 * §Notes). Field order matches the spec schema: path, message, schema_keyword.
 */
export interface ValidationIssue {
  /** JSON Pointer to the failing value, e.g. "/issues/0/severity". */
  path: string;
  /** Human-readable summary of the failure. */
  message: string;
  /** The JSON-Schema keyword that failed ("type", "required", "enum", …). */
  schema_keyword: string;
}

/** Subcause discriminator within `kind: "validation"`. */
export type ValidationCause = "schema_validation" | "empty_template";

/**
 * Fires when a typed query's final response fails AJV validation, including
 * respond-repair exhaustion and forced-respond non-compliance.
 */
export interface ValidationError {
  kind: string;
  cause: ValidationCause;
  message: string;
  /** Respond-repair follow-ups made before giving up. */
  attempts: number;
  /** Empty when cause = "empty_template". */
  validation_errors: ValidationIssue[];
  /** Final malformed assistant text; null when cause = "empty_template". */
  raw_response: string | null;
}

// --- The remaining eight variants ------------------------------------------

export interface TransportError {
  kind: string;
  message: string;
  /** null on network-level failure (no HTTP response). */
  http_status: number | null;
  /** Resolved `Model<Api>.api` value (api-shaped, e.g. "anthropic-messages"). */
  provider: string;
  retryable: boolean;
}

export interface ModelToolError {
  kind: string;
  message: string;
  tool_name: string;
  tool_call_id: string;
  raw_response: string | null;
}

export interface ContextOverflowError {
  kind: string;
  message: string;
  tokens_used: number | null;
  tokens_limit: number | null;
  raw_response: string | null;
}

export interface CancelledError {
  kind: string;
  message: string;
}

export interface ToolLoopExhaustedError {
  kind: string;
  message: string;
  /** == tool_loop.max_rounds on exhaustion. */
  rounds: number;
  /**
   * Most recent tool the model called on the loop's terminal free-phase round;
   * the `| null` branch has no theta 1.0-reachable case and is retained for
   * forward compatibility.
   */
  last_tool_name: string | null;
  /** Any text the model emitted alongside the final tool call. */
  raw_response: string | null;
}

export type CodeToolCause = "validation" | "execution" | "cancelled" | "unknown_tool";

export interface CodeToolError {
  kind: string;
  message: string;
  /** post-rename name as seen in `tools:`. */
  tool_name: string;
  cause: CodeToolCause;
}

export type InvokeInfraCause =
  | "load_failure"
  | "parse_failure"
  | "validation"
  | "return_validation"
  | "panic"
  | "internal_error"
  | "subagent_model_unresolved"
  // RFC-0005 / PIC-40: the child-side model pre-flight found the marshalled
  // `--provider`/`--model` reference resolved to a different model than intended
  // (subagent.md #pic-40; diagnostics/code-registry-runtime.md
  // `theta/runtime/subagent-model-preflight-mismatch`). Terminal, non-retryable;
  // surfaces to an `invoke` parent as this `invoke_infra` cause.
  | "subagent_model_preflight_mismatch";

export interface InvokeInfraError {
  kind: string;
  message: string;
  callee_path: string;
  cause: InvokeInfraCause;
}

/**
 * A thrown carrier that pins the `InvokeInfraCause` the invoke boundary MUST
 * surface for this failure, rather than defaulting to the `internal_error`
 * classification a bare interpreter throw receives. RFC-0005 uses it for the
 * child-side model pre-flight mismatch (`subagent_model_preflight_mismatch`),
 * which is raised from the subagent bind (before the callee body runs) yet must
 * still reach an `invoke` parent as its precise `invoke_infra` cause rather than
 * as `internal_error` (subagent.md #pic-40). `invoke-cancellation.ts` reads
 * `invokeInfraCause` in its boundary catch.
 */
export class InvokeInfraCauseError extends Error {
  constructor(
    message: string,
    readonly invokeInfraCause: InvokeInfraCause,
  ) {
    super(message);
  }
}

export interface InvokeCalleeError {
  kind: string;
  message: string;
  callee_path: string;
  /** The original Err the callee returned (self-referential within the union). */
  inner: QueryError;
}

/**
 * The nine-variant `QueryError` union (queryerror-variants.md). The `kind`
 * discriminator is typed `string` on every arm — the ERR-15 type-openness seam:
 * adding a tenth variant in a minor revision does not break the type-system
 * shape of code that already destructures `QueryError`.
 */
export type QueryError =
  | ValidationError
  | TransportError
  | ModelToolError
  | ContextOverflowError
  | CancelledError
  | ToolLoopExhaustedError
  | CodeToolError
  | InvokeInfraError
  | InvokeCalleeError;

// --- ERR-14 — canonical ValidationIssue ordering ---------------------------

/**
 * ERR-14. Return `validation_errors` in the canonical deterministic order: a
 * stable ascending sort keyed on the tuple (path, schema_keyword, message),
 * each field compared by Unicode code point. `validation_errors[0]` is therefore
 * well-defined (the canonically-first issue).
 *
 * The sort is stable: equal-key entries retain their input relative order.
 */
export function orderValidationIssues(
  issues: readonly ValidationIssue[],
): ValidationIssue[] {
  return [...issues]
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const byPath = compareByCodePoint(a.issue.path, b.issue.path);
      if (byPath !== 0) return byPath;
      const byKeyword = compareByCodePoint(
        a.issue.schema_keyword,
        b.issue.schema_keyword,
      );
      if (byKeyword !== 0) return byKeyword;
      const byMessage = compareByCodePoint(a.issue.message, b.issue.message);
      if (byMessage !== 0) return byMessage;
      // Stable: fall back to input position for fully equal-key entries.
      return a.index - b.index;
    })
    .map((entry) => entry.issue);
}

/**
 * Compare two strings by Unicode code point (not UTF-16 code unit), so an astral
 * character (a surrogate pair, first code unit 0xD800–0xDBFF) sorts after a BMP
 * character such as U+FFFF rather than before it.
 */
function compareByCodePoint(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const an = ai.next();
    const bn = bi.next();
    if (an.done && bn.done) return 0;
    if (an.done) return -1;
    if (bn.done) return 1;
    const ac = an.value.codePointAt(0) as number;
    const bc = bn.value.codePointAt(0) as number;
    if (ac !== bc) return ac < bc ? -1 : 1;
  }
}

// --- ERR-15 — discriminator type-openness seam -----------------------------

/**
 * ERR-15. The closed set of theta 1.0.0 `QueryError.kind` wire tags. The runtime
 * never emits a `kind` outside this set, even though the *type* of `kind` is the
 * open `string`. Order matches the union declaration.
 *
 */
export function theta10QueryErrorKinds(): readonly string[] {
  return THETA_10_QUERY_ERROR_KINDS;
}

const THETA_10_QUERY_ERROR_KINDS = [
  "validation",
  "transport",
  "model_tool",
  "context_overflow",
  "cancelled",
  "tool_loop_exhausted",
  "code_tool",
  "invoke_infra",
  "invoke_callee",
] as const;

/**
 * ERR-15. Whether `kind` is one of the nine theta 1.0.0 wire tags. The *type* of
 * `QueryError["kind"]` stays open (`string`); this runtime predicate is the
 * closed-conformance counterpart.
 *
 */
export function isTheta10QueryErrorKind(kind: string): boolean {
  return (THETA_10_QUERY_ERROR_KINDS as readonly string[]).includes(kind);
}

// --- ERR-17 — forced-respond non-compliance synthesised issue --------------

/**
 * The forced-respond non-compliance branch (queryerror-variants.md ERR-17):
 * either the turn carried plain text and no `tool_use` block, or it invoked a
 * `tool_use` block whose `name` is not the synthesised respond tool.
 */
export type ForcedRespondBranch =
  | { kind: "plain_text" }
  | {
      kind: "wrong_tool";
      /** The `name` field of the provider's first wrong `tool_use` block. */
      providerToolName: string;
      /** The synthesised respond tool name, `__theta_respond_<slug>`. */
      respondToolName: string;
    };

/**
 * ERR-17. Synthesise the single `ValidationIssue` for a forced respond turn that
 * did not invoke the synthesised respond tool. `path` is `""`, `schema_keyword`
 * is `"required"`, and the `message` literal varies by branch.
 *
 */
export function synthesizeForcedRespondIssue(
  branch: ForcedRespondBranch,
): ValidationIssue {
  const message =
    branch.kind === "plain_text"
      ? "model returned plain text instead of calling the forced respond tool"
      : `model invoked tool '${branch.providerToolName}' instead of the forced respond tool '${branch.respondToolName}'`;
  return { path: "", message, schema_keyword: "required" };
}

// --- ERR-19 — ToolLoopExhaustedError shape ---------------------------------

/** Inputs to a `ToolLoopExhaustedError`; `rounds` is set to `maxRounds`. */
export interface ToolLoopExhaustionInput {
  message: string;
  /** The configured `tool_loop.max_rounds`; becomes `rounds` on the error. */
  maxRounds: number;
  last_tool_name: string | null;
  raw_response: string | null;
}

/**
 * ERR-19. Build a `ToolLoopExhaustedError` whose `rounds == tool_loop.max_rounds`
 * and whose `kind` is the `"tool_loop_exhausted"` wire tag.
 *
 */
export function makeToolLoopExhaustedError(
  input: ToolLoopExhaustionInput,
): ToolLoopExhaustedError {
  return {
    kind: "tool_loop_exhausted",
    message: input.message,
    rounds: input.maxRounds,
    last_tool_name: input.last_tool_name,
    raw_response: input.raw_response,
  };
}
