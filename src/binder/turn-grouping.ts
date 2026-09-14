// Shared turn-grouping helper for the V11i session-context truncation walk
// (session-context-walk.ts) and the V11b compact-transcript renderer
// (compact-transcript.ts): both require the same turn boundary, and this
// module is their single shared definition of it.
//
// This module owns no independent spec obligation of its own; it is the one
// place the turn-boundary rule the two callers below cite is written down.
//
// Spec: binder/binder-model-and-context.md (§"Session-context truncation
// (`bind_context: session`)", §"Compact-transcript format (normative)").

import type { AgentMessage } from "@earendil-works/pi-agent-core";

/**
 * Group a chronological message list into turns: a turn is a `user` message
 * plus all subsequent assistant / toolResult / custom messages up to (but not
 * including) the next `user` message. `buildSessionContext(...).messages` is
 * guaranteed to begin with a `user` message (leading-`user`-message
 * precondition), so no leading run falls outside a turn; a message preceding
 * any `user` message (contra the precondition) still opens a turn so grouping
 * stays total.
 */
export function groupMessagesIntoTurns(
  messages: readonly AgentMessage[],
): AgentMessage[][] {
  const turns: AgentMessage[][] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
    } else {
      turns[turns.length - 1]?.push(message);
    }
  }
  return turns;
}
