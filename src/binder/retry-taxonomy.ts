// V11f / V11f-T — Binder per-class retry budget and failure taxonomy (hard
// ceiling #3).
//
// This module owns the runtime that drives the binder's per-slash-invocation
// retry budget and renders the six failure-mode templates through the shared
// V11e system-note discipline:
//
//   - `runBinderWithRetries` — the per-class retry budget driver
//     (determinism-cancellation-failure.md §"Per-invocation retry budget",
//     hard-ceilings/ceilings-3-and-4.md §HC3). Each binder attempt is classified
//     independently (the provider-error classifier of V9j, combined with the
//     post-classifier envelope / AJV checks); a transport-class or
//     malformed-envelope-class failure is eligible for a single retry of its own
//     class (HC3-a / HC3-b), an AJV-on-`args` failure is terminal (HC3-c), and
//     the two budgets interleave so the runtime issues at most 3 binder LLM
//     calls per slash invocation (HC3-d). When the chain ends with both budgets
//     exhausted the surfaced note is the most-recent failure's row (HC3-e).
//   - `renderBinderSystemNote` — the six verbatim failure-mode templates
//     (determinism-cancellation-failure.md §"Failure-mode templates"), rendered
//     through the V11e line discipline (`renderFailureNote` / `capSystemNote`).
//     `<provider>` is the classifier's `TransportError.provider` (`Model<Api>.api`);
//     `<ajv-summary>` is the joined `ValidationIssue` summary below.
//   - `renderAjvSummary` / `renderDepthWalkAjvSummary` — the `<ajv-summary>`
//     placeholder: the in-order `<path> <message>` concatenation joined by the
//     two-character separator `; ` (`renderAjvSummary`), and the depth-walk
//     fast-fail single-issue form (`renderDepthWalkAjvSummary`, no separator).
//   - `classifyBinderArgs` — the cross-ceiling `params`-boundary classification
//     (CIO-1 / CIO-3): the depth-walk runs before AJV; a depth breach at the
//     `params` boundary cross-routes (ceiling #4 → ceiling #3) into the
//     AJV-on-`args` class with the depth-walk-synthesised summary, an AJV
//     failure classifies with the joined summary, and a clean value is `ok`.
//
// V11f-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function inertly — the renderers return the `UNIMPLEMENTED` sentinel,
// `runBinderWithRetries` returns a zero-call sentinel result without issuing any
// attempt, and `classifyBinderArgs` always reports `ok` — so the failing tests
// compile and red on their own primary assertions. The paired V11f
// implementation leaf fills them in.
//
// Spec: binder/determinism-cancellation-failure.md (§"Failure-class taxonomy",
// §"Failure-mode templates", §"Per-invocation retry budget"),
// hard-ceilings/ceilings-3-and-4.md (§HC3, CIO-1 / CIO-3).

import type { ValidationIssue } from "../runtime/query-error";
import type { DepthViolationIssue, DepthWalkResult } from "../runtime/depth-walk";
import { capSystemNote, renderFailureNote } from "./system-note";

/**
 * The worst-case binder LLM-call budget per slash invocation
 * (HC3-d): 1 initial attempt + at most 1 transport-class retry + at most 1
 * malformed-envelope-class retry.
 */
export const MAX_BINDER_LLM_CALLS = 3;

/** The two-character `<ajv-summary>` inter-issue separator (spec: `; `). */
const AJV_SUMMARY_SEPARATOR = "; ";

// --- the six failure-mode surfaces ------------------------------------------

/**
 * A binder outcome that surfaces as one of the six failure-mode templates
 * (determinism-cancellation-failure.md §"Failure-mode templates"). `needs_info`
 * and `ambiguous` carry model-supplied `message`; `transport` carries the
 * classifier's `provider` (`Model<Api>.api`) and `message`; `ajv_args` carries
 * the rendered `<ajv-summary>`; `malformed` and `cancelled` are fixed-suffix.
 */
export type BinderFailureSurface =
  | { readonly kind: "needs_info"; readonly message: string }
  | { readonly kind: "ambiguous"; readonly message: string }
  | { readonly kind: "transport"; readonly provider: string; readonly message: string }
  | { readonly kind: "malformed" }
  | { readonly kind: "ajv_args"; readonly ajvSummary: string }
  | { readonly kind: "cancelled" };

/**
 * Render a binder failure surface to its verbatim system-note template
 * (determinism-cancellation-failure.md §"Failure-mode templates"), through the
 * V11e line discipline. Only the `<…>` placeholders are interpolated; the
 * surrounding template text is fixed.
 *
 * The `needs_info`, `ambiguous`, `malformed`, and `ajv_args` rows follow the
 * rule-3 em-dash grammar `theta /<name>: <fixed-phrase> — <suffix>` and compose
 * through {@link renderFailureNote}. The `transport` row (its own
 * `(<provider>: <message>)` parenthetical grammar) and the `cancelled` row (no
 * suffix) do not use the em-dash boundary, so they are composed directly and
 * passed through the rule-2 length cap {@link capSystemNote}.
 */
export function renderBinderSystemNote(
  thetaName: string,
  surface: BinderFailureSurface,
): string {
  switch (surface.kind) {
    case "needs_info":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "argument binding needs more info",
        suffix: surface.message,
      });
    case "ambiguous":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "ambiguous arguments",
        suffix: surface.message,
      });
    case "malformed":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "argument binding failed",
        suffix: "could not parse arguments",
      });
    case "ajv_args":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "argument binding produced invalid args",
        suffix: surface.ajvSummary,
      });
    case "transport":
      // The transport row uses the `(<provider>: <message>)` parenthetical
      // rather than the em-dash suffix boundary; `<provider>` is the
      // classifier's `Model<Api>.api` value rendered verbatim.
      return capSystemNote(
        `theta /${thetaName}: argument binder unavailable (${surface.provider}: ${surface.message})`,
      );
    case "cancelled":
      return capSystemNote(`theta /${thetaName}: argument binding cancelled`);
  }
}

/**
 * The binder-failure runtime event's `message` field (bug 0397 §Fix constraint
 * 1): the same string interpolated into the user-facing template above, per
 * surface — the single source of truth for the surface→string map so a
 * `RuntimeEvent` builder never re-derives its own copy.
 */
export function binderFailureMessage(surface: BinderFailureSurface): string {
  switch (surface.kind) {
    case "needs_info":
    case "ambiguous":
    case "transport":
      return surface.message;
    case "ajv_args":
      return surface.ajvSummary;
    case "malformed":
      return "could not parse arguments";
    case "cancelled":
      return "argument binding cancelled";
  }
}

// --- the `<ajv-summary>` placeholder ----------------------------------------

/**
 * The `<ajv-summary>` placeholder (determinism-cancellation-failure.md
 * §"Failure-mode templates"): the in-order `<path> <message>` concatenation of
 * the failed validation's `ValidationIssue` entries, joined by the
 * two-character separator `; ` in canonical `validation_errors` order. An empty
 * issue list renders the empty string.
 */
export function renderAjvSummary(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.path} ${issue.message}`)
    .join(AJV_SUMMARY_SEPARATOR);
}

/**
 * The depth-walk fast-fail `<ajv-summary>` form (determinism-cancellation-
 * failure.md §"Failure-mode templates", Depth-walk fast-fail clause): the single
 * canonical depth-walk `ValidationIssue` rendered as `<JSON-Pointer> <message>`
 * — single-issue form, **no `; ` separator**. Synthesised from the depth-walk
 * issue (`schema_keyword: "maxDepth"`, message `"JSON document depth exceeds 5"`),
 * NOT from an `errorsText` traversal of the (empty) AJV `errors` array — AJV did
 * not run at this site.
 */
export function renderDepthWalkAjvSummary(issue: DepthViolationIssue): string {
  // Single-issue form: the one canonical depth-walk issue rendered as
  // `<JSON-Pointer> <message>` with no `; ` separator — synthesised from the
  // depth-walk issue, not from an `errorsText` traversal of the empty AJV
  // `errors` array.
  return `${issue.path} ${issue.message}`;
}

// --- cross-ceiling `params`-boundary classification (CIO-1 / CIO-3) ---------

/** The `params`-boundary classification of a `kind: "ok"` binder envelope's args. */
export type BinderArgsClassification =
  | { readonly kind: "ok" }
  | { readonly kind: "ajv_args"; readonly ajvSummary: string };

/** Inputs to {@link classifyBinderArgs}: the depth-walk result then the AJV issues. */
export interface ClassifyBinderArgsInput {
  /** The depth-walk verdict over the merged `args` (runs before AJV per CIO-3). */
  readonly depth: DepthWalkResult;
  /** The AJV `ValidationIssue`s over the merged `args`; empty when depth breached. */
  readonly ajvIssues: readonly ValidationIssue[];
}

/**
 * Classify a `kind: "ok"` binder envelope's args at the `params` boundary
 * (CIO-3: depth-walk before AJV; CIO-1: ceiling #4's slash-load `params` arm
 * cross-routes into ceiling #3's AJV-on-`args` class). A depth breach yields the
 * AJV-on-`args` class with the depth-walk-synthesised summary; a non-empty AJV
 * issue set yields the AJV-on-`args` class with the joined summary; a clean
 * value is `ok`.
 */
export function classifyBinderArgs(
  input: ClassifyBinderArgsInput,
): BinderArgsClassification {
  // CIO-3: the depth-walk runs before AJV at the `params` boundary. A depth
  // breach cross-routes (CIO-1: ceiling #4 → ceiling #3) into the AJV-on-`args`
  // class with the depth-walk-synthesised summary — AJV did not run, so its
  // issue set is empty and is not consulted here.
  if (!input.depth.ok) {
    return {
      kind: "ajv_args",
      ajvSummary: renderDepthWalkAjvSummary(input.depth.issue),
    };
  }
  if (input.ajvIssues.length > 0) {
    return { kind: "ajv_args", ajvSummary: renderAjvSummary(input.ajvIssues) };
  }
  return { kind: "ok" };
}

// --- the per-class retry budget driver --------------------------------------

/**
 * The classified outcome of a single binder attempt (determinism-cancellation-
 * failure.md §"Failure-class taxonomy"). `ok` / `needs_info` / `ambiguous` /
 * `ajv_args` are terminal (no retry); `transport` and `malformed` are the two
 * retry-eligible classes. ContextOverflow folds into `transport` before it
 * reaches the driver (context-overflow-handling clause).
 */
export type BinderAttemptOutcome =
  | { readonly kind: "ok" }
  | { readonly kind: "needs_info"; readonly message: string }
  | { readonly kind: "ambiguous"; readonly message: string }
  | { readonly kind: "ajv_args"; readonly ajvSummary: string }
  | { readonly kind: "transport"; readonly provider: string; readonly message: string }
  | { readonly kind: "malformed" };

/** Inputs to {@link runBinderWithRetries}. */
export interface BinderRetryInput {
  /**
   * Issue one binder LLM call and return its classified outcome. `attemptIndex`
   * is 0 for the initial attempt and increments per retry. The driver invokes
   * this at most {@link MAX_BINDER_LLM_CALLS} times per slash invocation.
   */
  readonly attempt: (attemptIndex: number) => Promise<BinderAttemptOutcome>;
}

/** The result of the retry budget driver. */
export interface BinderRetryResult {
  /** The number of binder LLM calls issued (1 … {@link MAX_BINDER_LLM_CALLS}). */
  readonly callCount: number;
  /** The terminal (most-recent) outcome whose row surfaces per HC3-e. */
  readonly outcome: BinderAttemptOutcome;
}

/**
 * Drive the binder's per-class retry budget (HC3-a … HC3-e). Each attempt is
 * classified independently; a transport-class failure consumes the single
 * transport budget on retry (HC3-a), a malformed-envelope failure the single
 * malformed budget (HC3-b), and the two interleave so at most
 * {@link MAX_BINDER_LLM_CALLS} calls are issued (HC3-d). AJV-on-`args` failures
 * are terminal (HC3-c). The returned `outcome` is the most-recent failure's row
 * (HC3-e).
 *
 * Each attempt is classified independently. A `transport` or `malformed`
 * failure consumes its own single per-invocation budget on retry; the two
 * budgets interleave (a transport failure observed on the retry of a malformed
 * envelope consumes the transport budget, and symmetrically), bounding the
 * issued calls at {@link MAX_BINDER_LLM_CALLS}. `ok` / `needs_info` /
 * `ambiguous` / `ajv_args` are terminal (HC3-c: AJV-on-`args` carries no retry
 * budget). The returned `outcome` is the most-recent attempt's outcome, so the
 * surfaced row matches the most recent failure (HC3-e).
 */
export async function runBinderWithRetries(
  input: BinderRetryInput,
): Promise<BinderRetryResult> {
  let transportBudget = 1;
  let malformedBudget = 1;
  let callCount = 0;

  // The loop issues at most MAX_BINDER_LLM_CALLS attempts: it re-issues only
  // while a retry-eligible class still has budget, and each retry consumes one
  // of the two single budgets, so it terminates after at most 1 initial + 1
  // transport + 1 malformed = 3 attempts.
  for (;;) {
    const outcome = await input.attempt(callCount);
    callCount += 1;

    if (outcome.kind === "transport" && transportBudget > 0) {
      transportBudget -= 1;
      continue;
    }
    if (outcome.kind === "malformed" && malformedBudget > 0) {
      malformedBudget -= 1;
      continue;
    }
    // Terminal (ok / needs_info / ambiguous / ajv_args) or a retry-eligible
    // class whose budget is exhausted: surface the most-recent outcome.
    return { callCount, outcome };
  }
}
