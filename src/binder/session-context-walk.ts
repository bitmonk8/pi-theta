// V11i / V11i-T — the `bind_context: session` session-context truncation walk
// (the input to the V11b compact-transcript renderer's included-turn slice).
//
// This module owns:
//   - the session-context truncation walk (binder/binder-model-and-context.md
//     §"Session-context truncation (`bind_context: session`)"): source the
//     message list from `buildSessionContext(...).messages`, count tokens per
//     message through the injected `TokenEstimator` seam (PIC-16, V8e), group
//     into turns (the same turn boundary the V11b renderer uses), and walk
//     newest-to-oldest including a candidate turn iff, after inclusion, the
//     running token total is ≤ 8000 AND the running turn count is ≤ 20 — the
//     first candidate that would violate either inequality is excluded entirely
//     (whole-turn truncation; partial messages are not split) and terminates the
//     walk. Both cap-equality boundaries are inclusive.
//   - the BNDR-10 subagent-mode skip
//     (binder/binder-model-and-context.md#bndr-10): a `bind_context: session`
//     declaration on a `mode: subagent` theta is treated as `bind_context: none`
//     for binder-input construction — the walk is skipped and no *Recent session
//     context* block is emitted.
//
// Spec: binder/binder-model-and-context.md (§"Session-context truncation
// (`bind_context: session`)", BNDR-10).

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ThetaMode } from "../parser/frontmatter";
import type { TokenEstimator } from "../seams/token-estimator";

/** The inclusive running-token-total cap of the truncation walk (8000 tokens). */
const SESSION_CONTEXT_TOKEN_CAP = 8000;

/** The inclusive running-turn-count cap of the truncation walk (20 turns). */
const SESSION_CONTEXT_TURN_CAP = 20;

/** The `bind_context:` field value governing whether the walk runs at all. */
export type BindContext = "none" | "session";

/** Inputs to one session-context truncation walk. */
export interface SessionContextWalkInput {
  /**
   * The message list, chronological oldest-to-newest (the newest turn sits at
   * the array tail), sourced from
   * `buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages`.
   */
  readonly messages: readonly AgentMessage[];
  /** The injected per-message token-count seam (PIC-16). */
  readonly estimator: TokenEstimator;
  /** The theta's resolved `mode:` — drives the BNDR-10 subagent-mode skip. */
  readonly mode: ThetaMode;
  /** The theta's `bind_context:` value. */
  readonly bindContext: BindContext;
}

/**
 * The outcome of the session-context truncation walk.
 *
 *   - `applies` — `true` iff `bind_context: session` AND `mode: prompt`. When
 *     `false` the walk did not run (either `bind_context: none`, or the BNDR-10
 *     subagent-mode skip that treats session-on-subagent as `none`) and no
 *     *Recent session context* block is emitted; `includedMessages` is empty.
 *   - `includedMessages` — the included-turn slice, chronological
 *     oldest-to-newest, ready for the V11b compact-transcript renderer. Empty
 *     when `applies` is `false` or when zero turns survive the walk (the
 *     BNDR-7i void-truncation case, whose whole-block omission the V11b renderer
 *     owns).
 *   - `includedTurnCount` — the number of whole turns included (0 when none).
 *   - `includedTokenTotal` — the running token total of the included turns
 *     (0 when none).
 */
export interface SessionContextWalkResult {
  readonly applies: boolean;
  readonly includedMessages: readonly AgentMessage[];
  readonly includedTurnCount: number;
  readonly includedTokenTotal: number;
}

/**
 * Run the `bind_context: session` truncation walk (or the BNDR-10 subagent-mode
 * skip): turns are walked newest-to-oldest under the inclusive 8000-token /
 * 20-turn caps.
 *
 * Included turns are returned chronological oldest-to-newest, ready for the
 * V11b compact-transcript renderer. The result record is constructed fresh per
 * call (no module-level object binding, no cached state — the BNDR-12
 * re-entrancy invariant).
 */
export function walkSessionContext(
  input: SessionContextWalkInput,
): SessionContextWalkResult {
  // BNDR-10: at slash-invocation time a `bind_context: session` declaration on a
  // `mode: subagent` theta is treated as `bind_context: none` — the walk is
  // skipped and no *Recent session context* block is emitted. The walk applies
  // only when session context is requested on a prompt-mode theta.
  const applies = input.bindContext === "session" && input.mode === "prompt";
  if (!applies) {
    return {
      applies: false,
      includedMessages: [],
      includedTurnCount: 0,
      includedTokenTotal: 0,
    };
  }

  // Group into turns using the same turn boundary the V11b renderer uses: a turn
  // is a `user` message plus all subsequent assistant / toolResult / custom
  // messages up to (but not including) the next `user` message.
  // `buildSessionContext(...).messages` is guaranteed to begin with a `user`
  // message (leading-`user`-message precondition), so no leading run falls
  // outside a turn; a message preceding any `user` (contra the precondition)
  // still opens a turn so the walk stays total.
  const turns: AgentMessage[][] = [];
  for (const message of input.messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
    } else {
      turns[turns.length - 1]?.push(message);
    }
  }

  // Walk turns newest-to-oldest (the newest turn sits at the array tail).
  // Include a candidate turn iff, after inclusion, the running token total is
  // ≤ 8000 AND the running turn count is ≤ 20; the first candidate that would
  // violate either inequality is excluded entirely (whole-turn truncation;
  // partial messages are not split) and terminates the walk. Both cap-equality
  // boundaries are inclusive.
  let runningTokens = 0;
  let runningTurns = 0;
  const includedNewestFirst: AgentMessage[][] = [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn === undefined) {
      continue;
    }
    const turnTokens = turn.reduce(
      (sum, message) => sum + input.estimator.estimate(message),
      0,
    );
    const candidateTokens = runningTokens + turnTokens;
    const candidateTurns = runningTurns + 1;
    if (
      candidateTokens > SESSION_CONTEXT_TOKEN_CAP ||
      candidateTurns > SESSION_CONTEXT_TURN_CAP
    ) {
      break;
    }
    runningTokens = candidateTokens;
    runningTurns = candidateTurns;
    includedNewestFirst.push(turn);
  }

  // Emit the included turns chronological oldest-to-newest: the walk accumulated
  // them newest-to-oldest, so reverse the turn order and flatten each turn's
  // messages (already chronological within the turn).
  const includedMessages: AgentMessage[] = [];
  for (let i = includedNewestFirst.length - 1; i >= 0; i -= 1) {
    const turn = includedNewestFirst[i];
    if (turn !== undefined) {
      includedMessages.push(...turn);
    }
  }

  return {
    applies: true,
    includedMessages,
    includedTurnCount: runningTurns,
    includedTokenTotal: runningTokens,
  };
}
