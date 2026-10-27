// V9c / V9c-T — prompt-mode conversation drive and active-set gating seam.
//
// This module owns the PIC-17 active-set install-vector computation, the
// untyped-query trailing-turn `Ok(string)` extraction
// (pi-integration-contract/conversation-drive.md):
//
//   - PIC-17 active-set install-vector computation: `computeActiveSetInstall`
//     derives the exact step-2 install vector
//     `[...thetaCallableSetNames, respondToolName?]` — the theta's callable-set
//     underlying Pi-tool names plus, on a forced-respond turn, the synthesised
//     respond tool appended last. The step-1 snapshot is deliberately NOT
//     unioned in — "ambient tools are deliberately not inherited". The gating
//     window itself (snapshot / swap-install / restore under the PIC-8/PIC-19
//     protocol) is `withActiveSetGate` (`../runtime/tool-registration.ts`,
//     bug 0372 §Fix): the producer's prompt-mode query window threads this
//     module's computed install vector into that gate; the prompt→prompt
//     `invoke` window (`invoke-prompt-suspend.ts`) hands the gate the child's
//     callable set directly.
//   - PIC-2 prompt-mode sequential execution: within a single user session no
//     two prompt-mode bodies hold an open snapshot/restore window at a time —
//     a nested prompt → prompt `invoke(...)` opens its window only after the
//     parent body's window has been restored (cross-body non-overlap).
//   - PIC-53 untyped-query `Ok(string)` trailing-turn extraction: the value is
//     the accumulated assistant text of the final turn.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-2, PIC-53);
// pi-integration-contract/tool-registration-lifetime.md (PIC-17 active-set
// gating, §"Acceptance criteria — PIC-17 active-set install vector").

import type { Message } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// PIC-17 / PIC-2 — active-set gating window.
// ---------------------------------------------------------------------------

/**
 * The callable set installed for one query's active-set window: the theta's
 * declared callable-set names, plus the synthesised respond tool when the turn
 * is a typed-query forced-respond turn. The step-1 snapshot is NOT a member —
 * ambient tools are deliberately not inherited (PIC-17).
 */
export interface CallableSetInstall {
  readonly thetaCallableSetNames: readonly string[];
  readonly respondToolName?: string;
}

/**
 * Compute the PIC-17 step-2 install vector: exactly
 * `[...thetaCallableSetNames, respondToolName?]`, with the respond tool appended
 * last only on a forced-respond turn. The ambient snapshot is deliberately not a
 * parameter here — it is never unioned into the install. Exported: the
 * producer's prompt-mode query window computes the `installVector` it threads
 * into `withActiveSetGate` (`../runtime/tool-registration.ts`) through this
 * function; the prompt→prompt `invoke` window (`invoke-prompt-suspend.ts`)
 * hands the gate the child's callable set directly.
 */
export function computeActiveSetInstall(install: CallableSetInstall): string[] {
  const names = [...install.thetaCallableSetNames];
  if (install.respondToolName !== undefined) {
    names.push(install.respondToolName);
  }
  return names;
}

// ---------------------------------------------------------------------------
// PIC-53 — untyped-query `Ok(string)` trailing-turn extraction.
// ---------------------------------------------------------------------------

/**
 * Extract the untyped-query `Ok(string)` value from the driven user session's
 * message list (PIC-53). The value is the accumulated assistant text of the
 * final turn: the trailing turn is the last `user` message plus every
 * subsequent message through the end of the list; the string is the `text`
 * content of every `assistant` message in that turn concatenated in
 * chronological order with a single `\n` separator between successive assistant
 * messages, with the provider-internal `thinking` array and all `toolCalls`
 * entries omitted. A final turn that produced no assistant text (a pure
 * tool-use turn) yields the empty string.
 *
 * `messages` is the chronological `Message` list `buildSessionContext(...)`
 * yields from the `ReadonlySessionManager` read surface.
 */
export function extractTrailingTurnText(messages: readonly Message[]): string {
  // PIC-53: the final turn is the last `user` message (the theta-issued
  // `pi.sendUserMessage` turn) plus every subsequent message through the end
  // of the list. Turns from earlier slash-command invocations on the
  // long-lived user session precede that `user` message and are excluded.
  let turnStart = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      turnStart = i;
      break;
    }
  }
  const turn = turnStart === -1 ? messages : messages.slice(turnStart);

  // The string is the `text` content of every `assistant` message in the final
  // turn, concatenated in chronological order with a single `\n` separator
  // between successive assistant messages; the provider-internal `thinking`
  // array and all `toolCalls` entries are omitted. A final turn that produced
  // no assistant text (a pure tool-use turn) yields the empty string.
  const assistantTexts: string[] = [];
  for (const message of turn) {
    if (message.role !== "assistant") {
      continue;
    }
    // Bug 0483 §Fix item 3 (PIC-53 residue exclusion): an `error`-stop
    // assistant is failure narration/retry residue pi deliberately keeps in
    // session history (0.80.10 `_prepareRetry`, "keep in session for
    // history"), not answer text. It lands in the trailing turn when pi's
    // in-run core retry re-ran the turn: after a recorded abort PIC-78
    // classifies `recovered`, or with no abort at all. A PIC-78 continuation
    // ride's user message opens a new trailing turn, so the aborted attempt's
    // residue already falls outside it.
    if (message.stopReason === "error") {
      continue;
    }
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("");
    assistantTexts.push(text);
  }
  return assistantTexts.join("\n");
}
