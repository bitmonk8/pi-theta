// V4c / V4c-T — terminal outcomes and the partial-append / non-mutation seam.
//
// This module owns the runtime side of the partial-append contract
// (errors-and-results/error-model.md §"Partial-append contract" and the
// §"Mid-stream cancellation, conversation state" obligations ERR-8 … ERR-12,
// cross-linked from cancellation.md §"Surfacing"). Turns Pi has committed to
// the conversation the loom was driving remain final; the runtime performs no
// implicit rollback. When a query's stream is interrupted mid-flight by
// cancellation — or by `?`-propagation after a partial stream — the runtime
// MUST NOT mutate any Pi-committed surface (no truncate / rewrite / replace /
// remove of assistant tokens, tool-call cards, or system notes) and MUST NOT
// inject a compensating turn (ERR-8 / ERR-9). The two paths are bound
// symmetrically (ERR-10); the non-mutation window binds between the cancelled
// streaming turn and the next driver send (ERR-11); and the non-mutation
// obligation holds inside a subagent loom too (ERR-12).
//
// V4c-T (tests-task) declares the seam — the committed-surface model, the
// `CommittedConversationMutator` the runtime holds against Pi's conversation,
// the `handlePartialTerminalOutcome` entry the runtime routes a mid-stream
// terminal event through, and the `classifyNonMutationWindow` scope helper — and
// stubs the behaviour-bearing functions with a deliberately non-compliant body
// (the stub mutates committed surfaces / injects a compensating turn, and the
// window helper mis-scopes) so the failing tests red on their own non-mutation
// primary assertions. The paired V4c implementation leaf replaces these bodies
// with the non-mutation contract.

/** The kinds of surface Pi can commit to the driven conversation. */
export type CommittedSurfaceKind = "assistant-tokens" | "tool-call-card" | "system-note";

/** One surface Pi has already committed before the terminal event fires. */
export interface CommittedSurface {
  readonly kind: CommittedSurfaceKind;
  readonly id: string;
  readonly content: string;
}

/**
 * The two mid-stream terminal paths ERR-10 binds symmetrically: an
 * `AbortSignal`-driven cancellation, and a `?`-propagation after a partial
 * stream.
 */
export type PartialTerminalPath = "cancelled" | "question-propagation";

/**
 * Which conversation the loom was driving: the caller's conversation in
 * `prompt` mode, or the disposable subagent conversation in `subagent` mode
 * (ERR-12 binds the same non-mutation obligation inside a subagent loom).
 */
export type DrivenConversationMode = "prompt" | "subagent";

/**
 * The mutating operations the runtime *could* perform against the conversation
 * Pi has committed. The partial-append / non-mutation contract (ERR-8 / ERR-9)
 * forbids the runtime from calling any of them on the cancellation and
 * `?`-propagation paths — the runtime performs no implicit rollback and injects
 * no compensating turn.
 */
export interface CommittedConversationMutator {
  /** Truncate a committed surface (forbidden on the partial path — ERR-8). */
  truncate(surfaceId: string): void;
  /** Re-write a committed surface's content (forbidden — ERR-8). */
  rewrite(surfaceId: string, content: string): void;
  /** Replace a committed surface wholesale (forbidden — ERR-8). */
  replace(surfaceId: string, surface: CommittedSurface): void;
  /** Remove a committed surface (forbidden — ERR-8). */
  remove(surfaceId: string): void;
  /** Inject a compensating turn (forbidden on the partial path — ERR-9). */
  injectCompensatingTurn(surface: CommittedSurface): void;
}

/** The mid-stream terminal event the runtime routes through the seam. */
export interface PartialTerminalOutcome {
  readonly path: PartialTerminalPath;
  readonly mode: DrivenConversationMode;
  /** The surfaces Pi has already committed before the terminal event. */
  readonly committed: readonly CommittedSurface[];
}

/**
 * Handle the terminal event that fires after a partial stream is interrupted by
 * cancellation or `?`-propagation. Per ERR-8 / ERR-9 / ERR-10 / ERR-12 the
 * runtime MUST NOT mutate any Pi-committed surface (no truncate / rewrite /
 * replace / remove) and MUST NOT inject a compensating turn — uniformly across
 * the cancellation and `?`-propagation paths and across prompt and subagent
 * modes. A compliant implementation therefore calls no method on `mutator`.
 */
export function handlePartialTerminalOutcome(
  outcome: PartialTerminalOutcome,
  mutator: CommittedConversationMutator,
): void {
  // STUB (V4c-T): NON-COMPLIANT placeholder so the failing tests red on their
  // non-mutation primary assertions. It performs exactly the mutations the
  // contract forbids — truncating and rewriting a committed surface (ERR-8) and
  // injecting a compensating turn (ERR-9) — on every path and in every mode
  // (ERR-10 / ERR-12). The paired V4c implementation leaf replaces this body
  // with the non-mutation contract (call nothing on `mutator`).
  const first = outcome.committed[0];
  if (first !== undefined) {
    mutator.truncate(first.id);
    mutator.rewrite(first.id, "");
  }
  mutator.injectCompensatingTurn({
    kind: "system-note",
    id: "v4c-stub-compensating-turn",
    content: `stub compensating turn for ${outcome.path}/${outcome.mode}`,
  });
}

/**
 * One event on the timeline the non-mutation window (ERR-11) is scoped against:
 * the cancelled streaming turn the window opens at, the next driver send it
 * closes at, and any respond-repair append the runtime records.
 */
export type WindowTimelineEvent =
  | { readonly kind: "cancelled-turn"; readonly turnId: string }
  | { readonly kind: "driver-send"; readonly sendId: string }
  | { readonly kind: "respond-repair-append"; readonly surface: CommittedSurface };

/**
 * The ERR-11 non-mutation window: for typed queries with respond-repair
 * follow-ups, the non-mutation obligation binds the runtime between the
 * cancelled streaming turn and the next driver send. Appends AFTER the next
 * driver send are the respond-repair loop's own — governed by Query
 * §"Schema-validation respond-repair", not ERR-11.
 */
export interface NonMutationWindow {
  /** The cancelled streaming turn id the window opens at. */
  readonly opensAt: string;
  /** The next driver-send id the window closes at (exclusive). */
  readonly closesAt: string;
  /**
   * Appends that fall inside the window `[cancelled-turn, next-driver-send)` —
   * these are the ERR-11 non-mutation-bound appends. Appends after the next
   * driver send are excluded (respond-repair's own, governed elsewhere).
   */
  readonly appendsInsideWindow: readonly CommittedSurface[];
}

/**
 * Classify the ERR-11 non-mutation window over a respond-repair timeline: the
 * window opens at the cancelled streaming turn and closes at the FIRST
 * subsequent driver send, and its `appendsInsideWindow` are exactly the
 * respond-repair appends that occur before that driver send.
 */
export function classifyNonMutationWindow(
  events: readonly WindowTimelineEvent[],
): NonMutationWindow {
  // STUB (V4c-T): NON-COMPLIANT placeholder so the ERR-11 window-scope test
  // reds. It mis-scopes the window — closing it at the LAST driver send rather
  // than the first, and collecting EVERY respond-repair append (including those
  // after the next driver send, which ERR-11 excludes). The paired V4c leaf
  // replaces this with the [cancelled-turn, next-driver-send) scope.
  let opensAt = "";
  let closesAt = "";
  const appendsInsideWindow: CommittedSurface[] = [];
  for (const event of events) {
    if (event.kind === "cancelled-turn") {
      opensAt = event.turnId;
    } else if (event.kind === "driver-send") {
      closesAt = event.sendId; // wrong: keeps overwriting to the LAST send
    } else {
      appendsInsideWindow.push(event.surface); // wrong: collects all appends
    }
  }
  return { opensAt, closesAt, appendsInsideWindow };
}
