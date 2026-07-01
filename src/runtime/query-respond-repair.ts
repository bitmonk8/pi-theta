// V13d / V13d-T — the schema-validation respond-repair loop.
//
// This module owns the interpreter-side seam the paired `V13d` implementation
// leaf fills in for a typed query's respond-repair loop
// (query/query-failure-and-repair.md QRY-11; errors-and-results/queryerror-variants.md
// ERR-17). Byte-exact follow-up turn template rendering (QRY-12) is a separate
// concern owned by `V13h`; this module owns only the loop's control flow and
// attempt accounting.
//
//   - QRY-11 respond-repair loop: when a typed query's final response fails AJV
//     validation (or the forced respond turn is non-compliant, ERR-17), the
//     runtime attempts respond-repair via *follow-up turns* — it appends a *new*
//     user turn per attempt (never re-issues the original query, which could
//     re-fire side effects), bounded by `respond_repair.attempts` (default 3).
//     Each follow-up that produces an assistant response the runtime then
//     re-validates counts as exactly one attempt, regardless of how many
//     tool-call rounds it contains. Terminal exhaustion returns
//     `Err(QueryError { kind: "validation", cause: "schema_validation",
//     attempts: <configured budget>, ... })`. `respond_repair.methodology: none`
//     (equivalently `attempts: 0`) issues no follow-up at all.
//   - QRY-11 proximate propagation: a follow-up that fails for a *non-validation*
//     reason (transport, cancelled, model_tool, tool_loop_exhausted,
//     context_overflow, invoke_infra, invoke_callee) propagates that proximate
//     `QueryError` variant and terminates respond-repair immediately — the
//     proximate cause wins, never `validation` with the prior attempt count. A
//     non-validation follow-up does NOT consume an `attempts` slot (the slot
//     debits only when a re-validation runs). `context_overflow` short-circuits
//     respond-repair permanently: once detected on any turn no further follow-up
//     is issued, because the conversation only grows.
//   - QRY-11 per-attempt budget: each respond-repair follow-up is a full
//     provider round-trip serviced with a *fresh* `tool_loop` budget — the same
//     `tool_loop.max_rounds` the original query used, not a decremented residue.
//   - ERR-17 forced-respond non-compliance: when the forced respond turn does
//     not invoke the synthesised `__loom_respond_<slug>` tool (plain text, or a
//     `tool_use` block whose name is not the respond tool), the runtime
//     synthesises a single `ValidationIssue` (path `""`, `schema_keyword`
//     `"required"`, branch-specific `message`) and feeds it into the same
//     respond-repair pipeline as an AJV failure — it consumes one `attempts`
//     slot and, on terminal exhaustion (or `none`/`0`), surfaces as
//     `Err(ValidationError { cause: "schema_validation", message: "model did not
//     call the forced respond tool", validation_errors: [<final synthesised
//     issue>], ... })`. On a multi-attempt sequence only the *last* attempt's
//     issue appears in `validation_errors`.
//
// V13d-T (this tests task) declares the seam shapes and stubs
// `runRespondRepairLoop` inert (it issues no follow-up and returns an inert
// `value` outcome) so the failing tests compile and red on their own primary
// assertions while the paired `V13d` implementation is absent.
//
// Spec: query/query-failure-and-repair.md (QRY-11 respond-repair loop,
// non-validation propagation, context-overflow short-circuit),
// errors-and-results/queryerror-variants.md (ERR-17 forced-respond
// non-compliance synthesised shapes; ValidationError shape).

import type {
  ForcedRespondBranch,
  QueryError,
  ValidationError,
  ValidationIssue,
} from "./query-error";

// ---------------------------------------------------------------------------
// The `respond_repair:` frontmatter configuration the loop reads.
// ---------------------------------------------------------------------------

/**
 * The non-`none` follow-up methodologies plus the `none` no-follow-up mode. The
 * byte-exact template each non-`none` methodology renders is owned by `V13h`;
 * this loop only distinguishes "issue a follow-up" (`validator_error` /
 * `schema_repeat`) from "issue none" (`none`).
 */
export type RespondRepairMethodology = "validator_error" | "schema_repeat" | "none";

/** The `respond_repair:` block: the follow-up methodology and attempt bound. */
export interface RespondRepairConfig {
  readonly methodology: RespondRepairMethodology;
  /** `respond_repair.attempts` (default 3); the bound on re-validated follow-ups. */
  readonly attempts: number;
}

// ---------------------------------------------------------------------------
// The failure that opened the loop, and each follow-up's outcome.
// ---------------------------------------------------------------------------

/**
 * The validation-family failure that opens the respond-repair loop: either an
 * AJV schema-validation failure (its ordered `ValidationIssue` entries) or a
 * forced-respond non-compliance (its branch, ERR-17). `raw_response` is the
 * final malformed assistant text (or `null` when the turn carried no plain-text
 * body).
 */
export type ValidationFailure =
  | {
      readonly kind: "schema_validation";
      readonly issues: readonly ValidationIssue[];
      readonly raw_response: string | null;
    }
  | {
      readonly kind: "noncompliance";
      readonly branch: ForcedRespondBranch;
      readonly raw_response: string | null;
    };

/**
 * One respond-repair follow-up turn's outcome:
 *  - `validated`     — the follow-up produced a response the runtime re-validated
 *                      successfully; the loop returns this value (one slot used).
 *  - `schema_validation` — the follow-up produced a response that AJV rejected
 *                      (one slot used).
 *  - `noncompliance` — the follow-up's forced respond turn was non-compliant
 *                      (ERR-17); the loop synthesises the issue (one slot used).
 *  - `non_validation` — the follow-up failed for a non-validation reason; the
 *                      loop propagates it and consumes NO slot.
 */
export type FollowUpResult =
  | { readonly kind: "validated"; readonly value: unknown }
  | {
      readonly kind: "schema_validation";
      readonly issues: readonly ValidationIssue[];
      readonly raw_response: string | null;
    }
  | {
      readonly kind: "noncompliance";
      readonly branch: ForcedRespondBranch;
      readonly raw_response: string | null;
    }
  | { readonly kind: "non_validation"; readonly error: QueryError };

/**
 * The follow-up driver held by dependency injection so a test scripts the
 * follow-up transcript deterministically and the live loop consults the same
 * shape. `nextFollowUp` appends the methodology-rendered user turn, awaits a
 * corrected response under a fresh `tool_loop` budget (`maxRounds`), re-validates
 * it, and returns the outcome. `attempt` is the 1-based follow-up index.
 */
export interface RespondRepairDriver {
  nextFollowUp(attempt: number, maxRounds: number): Promise<FollowUpResult>;
}

/** The per-query inputs the loop reads. */
export interface RespondRepairInput {
  readonly config: RespondRepairConfig;
  /** The `tool_loop.max_rounds` each follow-up is serviced with (fresh per attempt). */
  readonly maxRounds: number;
}

// ---------------------------------------------------------------------------
// The observable outcome.
// ---------------------------------------------------------------------------

/**
 * The respond-repair loop's outcome:
 *  - `value`      — a follow-up re-validated successfully; `attemptsUsed` is the
 *                   number of re-validated follow-ups debited.
 *  - `validation` — terminal exhaustion (or `none`/`0`): the `ValidationError`
 *                   whose `attempts` equals the number of re-validated follow-ups
 *                   (== the configured budget on exhaustion, `0` on `none`/`0`).
 *  - `propagated` — a proximate non-validation failure won; `error` is that
 *                   variant and `attemptsUsed` is the slots debited before it.
 */
export type RespondRepairOutcome =
  | { readonly kind: "value"; readonly value: unknown; readonly attemptsUsed: number }
  | { readonly kind: "validation"; readonly error: ValidationError }
  | { readonly kind: "propagated"; readonly error: QueryError; readonly attemptsUsed: number };

/**
 * ERR-17. The terminal-exhaustion `ValidationError.message` when the query gave
 * up on a forced-respond non-compliance (sourced verbatim from
 * queryerror-variants.md ERR-17's terminal-exhaustion `Err` shape).
 */
export const NONCOMPLIANCE_TERMINAL_MESSAGE = "model did not call the forced respond tool";

// ---------------------------------------------------------------------------
// The loop (V13d-T stub; the paired V13d fills it in).
// ---------------------------------------------------------------------------

/**
 * Run a typed query's schema-validation respond-repair loop (QRY-11, ERR-17).
 *
 * Given the `initial` validation-family failure that opened the loop, append
 * follow-up user turns (never re-issue the original query) bounded by
 * `config.attempts`, each serviced with a fresh `maxRounds` `tool_loop` budget:
 * a re-validated follow-up debits one slot; a proximate non-validation failure
 * propagates and debits none (`context_overflow` short-circuits permanently);
 * terminal exhaustion — or `methodology: none` / `attempts: 0` (no follow-up
 * issued) — surfaces `Err(ValidationError { cause: "schema_validation" })` whose
 * `validation_errors` carries only the final attempt's issue (the synthesised
 * ERR-17 issue on a non-compliance).
 *
 * V13d-T stubs this inert: it issues NO follow-up, consults neither `initial`
 * nor the `driver`, and returns an inert `value` outcome — so the attempt
 * accounting, proximate-propagation, per-attempt-budget, and ERR-17
 * synthesised-issue assertions red on their own primary expectation rather than
 * on a compile error, a missing fixture, or a harness throw. The paired `V13d`
 * leaf implements the loop.
 */
export function runRespondRepairLoop(
  initial: ValidationFailure,
  driver: RespondRepairDriver,
  input: RespondRepairInput,
): Promise<RespondRepairOutcome> {
  void initial;
  void driver;
  void input;
  return Promise.resolve({ kind: "value", value: null, attemptsUsed: 0 });
}
