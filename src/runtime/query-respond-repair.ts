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
//     not invoke the synthesised `__theta_respond_<slug>` tool (plain text, or a
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

import {
  synthesizeForcedRespondIssue,
  type ForcedRespondBranch,
  type QueryError,
  type ValidationError,
  type ValidationIssue,
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
 * The follow-up turn's OWN ceiling-#2 co-fire inputs (PIC-1 (d)): the fresh
 * `tool_loop` slot count at the follow-up's forced respond dispatch
 * (post-increment: one per free-phase round the restart ran, capped at
 * `max_rounds`) and the surfacing turn kind. A terminal validation error raised
 * on a follow-up is masked against THESE, not the parent query's exhausted
 * budget — each follow-up gets a fresh `tool_loop` budget (query-tool-loop.md
 * worked example; runtime-event-channel.md PIC-1 (d)).
 */
export interface FollowUpSurfacingTurn {
  readonly slotCountAtDispatch: number;
  readonly turnKind: "forced_respond" | "free_phase";
}

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
 *
 * The `schema_validation` / `noncompliance` arms carry `surfacing` — the
 * follow-up turn's own slot count and turn kind — so a terminal event raised on
 * this attempt is masked against the follow-up's budget (PIC-1 (d)). It is
 * OPTIONAL: the production drive always supplies it, but a driver that has no
 * follow-up turn metadata (a scripted double, the legacy string arm) may omit
 * it, and its absence falls back to the parent's scalar at the event build —
 * the pre-widening behaviour.
 */
export type FollowUpResult =
  | { readonly kind: "validated"; readonly value: unknown }
  | {
      readonly kind: "schema_validation";
      readonly issues: readonly ValidationIssue[];
      readonly raw_response: string | null;
      readonly surfacing?: FollowUpSurfacingTurn;
    }
  | {
      readonly kind: "noncompliance";
      readonly branch: ForcedRespondBranch;
      readonly raw_response: string | null;
      readonly surfacing?: FollowUpSurfacingTurn;
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
 *                   `surfacing` carries the FINAL follow-up's own turn scalars
 *                   when a follow-up ran (`attempts >= 1`) so the terminal event
 *                   masks against the follow-up's fresh budget (PIC-1 (d)); it
 *                   is absent on the `none`/`0` early terminal (`attempts == 0`),
 *                   whose surfaced failure is the parent's own.
 *  - `propagated` — a proximate non-validation failure won; `error` is that
 *                   variant and `attemptsUsed` is the slots debited before it.
 */
export type RespondRepairOutcome =
  | { readonly kind: "value"; readonly value: unknown; readonly attemptsUsed: number }
  | {
      readonly kind: "validation";
      readonly error: ValidationError;
      readonly surfacing?: FollowUpSurfacingTurn;
    }
  | { readonly kind: "propagated"; readonly error: QueryError; readonly attemptsUsed: number };

/**
 * ERR-17. The terminal-exhaustion `ValidationError.message` when the query gave
 * up on a forced-respond non-compliance (sourced verbatim from
 * queryerror-variants.md ERR-17's terminal-exhaustion `Err` shape).
 */
export const NONCOMPLIANCE_TERMINAL_MESSAGE = "model did not call the forced respond tool";

/**
 * The terminal-exhaustion `ValidationError.message` when the query gave up on an
 * AJV schema-validation failure (queryerror-variants.md ValidationError
 * `cause: "schema_validation"`).
 */
export const SCHEMA_VALIDATION_TERMINAL_MESSAGE =
  "typed query response failed schema validation";

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
 * The paired `V13d` leaf implements the loop.
 */
export async function runRespondRepairLoop(
  initial: ValidationFailure,
  driver: RespondRepairDriver,
  input: RespondRepairInput,
): Promise<RespondRepairOutcome> {
  const { methodology, attempts } = input.config;

  // `methodology: none` (equivalently `attempts: 0`) issues no follow-up at all:
  // the first validation-family failure surfaces immediately, its `attempts`
  // field `0`, carrying the opening failure's issue(s) (QRY-11; ERR-17 `none`).
  if (methodology === "none" || attempts <= 0) {
    return { kind: "validation", error: terminalValidationError(initial, 0) };
  }

  // The most recent validation-family failure — seeded by the opening failure
  // and replaced by each re-validated follow-up's failure. Its issue(s) and
  // `raw_response` are what a terminal-exhaustion `ValidationError` carries; the
  // spec pins that only the *final* attempt's issue survives (never a cumulative
  // concatenation across attempts).
  let latest: ValidationFailure = initial;
  // The final re-validated follow-up's own turn scalars (PIC-1 (d)): replaced on
  // each re-validated follow-up, and carried on the terminal `validation`
  // outcome so the event masks against the FOLLOW-UP's fresh budget, not the
  // parent's. Stays `undefined` only if no follow-up ever re-validates (which
  // cannot reach the exhaustion terminal — the first iteration always debits).
  let latestSurfacing: FollowUpSurfacingTurn | undefined = undefined;
  // Slots debited: one per *re-validated* follow-up (a schema-validation or
  // forced-respond-non-compliance outcome). A non-validation failure debits none.
  let attemptsUsed = 0;

  // Each iteration appends one *new* user turn (never re-issues the original
  // query) serviced with a *fresh* full `tool_loop` budget (`maxRounds`), then
  // re-validates the response. `attempt` is 1-based.
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await driver.nextFollowUp(attempt, input.maxRounds);
    switch (result.kind) {
      case "validated":
        // A follow-up re-validated successfully: debit its slot and return the
        // corrected value with the slots debited so far.
        attemptsUsed++;
        return { kind: "value", value: result.value, attemptsUsed };
      case "schema_validation":
        // A re-validation ran and AJV rejected the response: debit one slot and
        // carry this attempt's issue forward as the latest failure.
        attemptsUsed++;
        latest = {
          kind: "schema_validation",
          issues: result.issues,
          raw_response: result.raw_response,
        };
        latestSurfacing = result.surfacing;
        break;
      case "noncompliance":
        // Forced-respond non-compliance on the follow-up turn: same accounting as
        // an AJV failure — debit one slot and carry the branch forward so the
        // synthesised issue reflects the final attempt (ERR-17).
        attemptsUsed++;
        latest = {
          kind: "noncompliance",
          branch: result.branch,
          raw_response: result.raw_response,
        };
        latestSurfacing = result.surfacing;
        break;
      case "non_validation":
        // A non-validation failure (transport, cancelled, model_tool,
        // tool_loop_exhausted, context_overflow, invoke_infra, invoke_callee):
        // the proximate cause wins — propagate it immediately, consuming NO slot
        // and issuing no further follow-up. `context_overflow` short-circuits
        // permanently by the same path (the conversation only grows).
        return { kind: "propagated", error: result.error, attemptsUsed };
    }
  }

  // Terminal exhaustion of the attempts budget: surface the schema_validation
  // ValidationError whose `attempts` equals the re-validated-follow-up count
  // (== the configured budget on exhaustion), carrying only the final attempt's
  // issue(s) and `raw_response`.
  return {
    kind: "validation",
    error: terminalValidationError(latest, attemptsUsed),
    // Conditional so the property is ABSENT (not explicitly `undefined`) when no
    // follow-up supplied turn metadata — `exactOptionalPropertyTypes` demands it,
    // and the event build reads absence as the parent-scalar fallback.
    ...(latestSurfacing !== undefined ? { surfacing: latestSurfacing } : {}),
  };
}

/**
 * Build the terminal `ValidationError` (`cause: "schema_validation"`) the loop
 * surfaces on exhaustion or on `none`/`0`. Its `validation_errors` carries only
 * the given (final) failure's issue(s) — the AJV issues verbatim, or the single
 * ERR-17 synthesised issue on a forced-respond non-compliance — and its
 * `message` is the ERR-17 terminal message on a non-compliance, or the AJV
 * schema-validation message otherwise.
 */
function terminalValidationError(
  failure: ValidationFailure,
  attempts: number,
): ValidationError {
  if (failure.kind === "noncompliance") {
    return {
      kind: "validation",
      cause: "schema_validation",
      message: NONCOMPLIANCE_TERMINAL_MESSAGE,
      attempts,
      validation_errors: [synthesizeForcedRespondIssue(failure.branch)],
      raw_response: failure.raw_response,
    };
  }
  return {
    kind: "validation",
    cause: "schema_validation",
    message: SCHEMA_VALIDATION_TERMINAL_MESSAGE,
    attempts,
    validation_errors: [...failure.issues],
    raw_response: failure.raw_response,
  };
}
