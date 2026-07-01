// V4f / V4f-T — the no-rollback guarantee seam (ERR-13).
//
// This module owns the runtime side of the §"No rollback" contract
// (errors-and-results/error-model.md ERR-13, cross-linked from cancellation.md
// §"Race semantics" / §"Granularity"). Neither `?` nor a panic nor cancellation
// unwinds prior side effects: tool calls that have already returned, queries
// already appended to the conversation, and `invoke` children that have already
// run remain final on early return, abort, or cancellation. The guarantee is
// architectural — the runtime contains NO compensating / rollback path — so a
// completed callee's side effect survives a downstream terminal event by
// construction rather than by an undo being suppressed. The runtime does not
// roll back, compensate, or enumerate completed side effects to the caller or
// operator; idempotency and compensation are the loom author's responsibility.
//
// V4f-T (this tests-task) declares the seam — the enumerated authoring sites
// (`NoRollbackAuthoringSite`), the terminal-event kinds (`NoRollbackTerminalEvent`),
// the completed side-effect model (`CommittedSideEffect`), the `RollbackCompensator`
// surface the runtime holds against the driven conversation and any external side
// effect, and the `handleNoRollbackTerminalEvent` entry the runtime routes a
// terminal event through — and stubs the behaviour-bearing entry NON-COMPLIANTLY
// (it unwinds the committed side effects and injects a compensating turn) so the
// failing V4f-T tests red on their own primary no-rollback assertions. The paired
// V4f implementation leaf fills in the behaviour: the entry calls NONE of the
// compensator's operations for any outcome.
//
// Spec: errors-and-results/error-model.md (§"No rollback" ERR-13, §"Partial-append
// contract", §"Runtime panics"); cancellation.md (§"Race semantics", §"Granularity").

import type { InvokeInfraError } from "./query-error";

/**
 * The three terminal-event kinds §"No rollback" (ERR-13) binds uniformly: a `?`
 * early-return, a runtime panic, and a mid-execution cancellation. Each leaves
 * prior side effects final.
 */
export type NoRollbackTerminalEvent = "question" | "panic" | "cancellation";

/**
 * The six enumerated ERR-13 authoring sites the guarantee is witnessed on:
 *   1. a `?`-early-return inside a function;
 *   2. a `?`-early-return at the top of a loom block;
 *   3. a panic in a slash-command loom;
 *   4. a panic in an `invoke` child (parent observes `InvokeInfraError { cause: "panic" }`);
 *   5. a mid-execution cancellation; and
 *   6. completed-callee finality — a tool call / `invoke` child driven to
 *      completion, then a downstream `?` / panic / cancel, whose completed
 *      callee's side effect persists (a completed callee distinct from an
 *      appended turn).
 */
export type NoRollbackAuthoringSite =
  | "question-early-return-in-function"
  | "question-early-return-loom-block"
  | "panic-slash-command"
  | "panic-invoke-child"
  | "mid-execution-cancellation"
  | "completed-callee-finality";

/** The enumerated ERR-13 authoring sites, in the order the spec lists them. */
export const NO_ROLLBACK_AUTHORING_SITES = [
  "question-early-return-in-function",
  "question-early-return-loom-block",
  "panic-slash-command",
  "panic-invoke-child",
  "mid-execution-cancellation",
  "completed-callee-finality",
] as const;

/**
 * The kinds of external / conversational side effect a completed callee may
 * have produced before the terminal event fired. Per ERR-13 each remains final:
 * a tool call that has already returned, a query already appended to the
 * conversation, an `invoke` child that has already run, and the external side
 * effects the §"Cancellation behaves the same way" paragraph enumerates
 * (filesystem writes, network requests, calls into Pi-side services, sub-loom
 * mutations).
 */
export type CommittedSideEffectKind =
  | "tool-call"
  | "query"
  | "invoke-child"
  | "filesystem-write"
  | "network-request"
  | "pi-service-call"
  | "sub-loom-mutation";

/** One side effect a completed callee produced before the terminal event. */
export interface CommittedSideEffect {
  readonly kind: CommittedSideEffectKind;
  readonly id: string;
  readonly description: string;
}

/** A compensating turn the runtime is forbidden to inject after a terminal event. */
export interface CompensatingTurn {
  readonly id: string;
  readonly content: string;
}

/**
 * The compensating / rollback operations the runtime *could* perform against a
 * completed callee's side effects and the driven conversation. The §"No rollback"
 * contract (ERR-13) forbids the runtime from calling ANY of them on the `?`,
 * panic, and cancellation paths — there is no implicit transactional layer, no
 * undo, and the runtime does not enumerate completed side effects to the caller
 * or operator. A compliant runtime therefore never touches this surface; it
 * exists only so a test can witness that the runtime does not.
 */
export interface RollbackCompensator {
  /** Unwind (undo) an already-committed side effect (forbidden — ERR-13). */
  unwindSideEffect(id: string): void;
  /** Inject a compensating turn into the driven conversation (forbidden — ERR-13). */
  appendCompensatingTurn(turn: CompensatingTurn): void;
  /** Enumerate completed side effects to the caller / operator (forbidden — ERR-13). */
  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void;
}

/**
 * The terminal event the runtime routes through the no-rollback seam: which
 * authoring site fired it, which terminal-event kind it is, the side effects a
 * completed callee produced before it fired (each of which must remain final),
 * and — for the `invoke`-child sites — the failure envelope the parent observes
 * (`InvokeInfraError { cause: "panic" }` for a panicking child; the child's
 * already-committed tool calls remain committed even though the parent observes
 * only this envelope).
 */
export interface NoRollbackTerminalOutcome {
  readonly site: NoRollbackAuthoringSite;
  readonly event: NoRollbackTerminalEvent;
  readonly committed: readonly CommittedSideEffect[];
  readonly invokeParentSurface?: InvokeInfraError;
}

/**
 * Route a terminal event (`?` early-return, panic, or cancellation) through the
 * no-rollback contract (ERR-13). Per the guarantee the runtime unwinds NO prior
 * side effect and injects NO compensating turn — uniformly across the six
 * enumerated authoring sites — so a compliant implementation calls NONE of the
 * `compensator` operations for any `outcome`. The committed side effects are
 * read-only here; the whole content of the contract is the absence of any
 * compensating call.
 */
export function handleNoRollbackTerminalEvent(
  outcome: NoRollbackTerminalOutcome,
  compensator: RollbackCompensator,
): void {
  // V4f-T stub — deliberately NON-COMPLIANT so the paired V4f-T tests red on
  // their own primary no-rollback assertions while V4f is absent. A rollback-
  // performing runtime would unwind each committed side effect and inject a
  // compensating turn; ERR-13 forbids exactly that. The paired V4f leaf replaces
  // this body with one that calls nothing on `compensator`.
  for (const effect of outcome.committed) {
    compensator.unwindSideEffect(effect.id);
  }
  compensator.enumerateCompletedSideEffects(outcome.committed);
  compensator.appendCompensatingTurn({
    id: `compensating-for-${outcome.site}`,
    content: `rolled back ${outcome.committed.length} side effect(s)`,
  });
}
