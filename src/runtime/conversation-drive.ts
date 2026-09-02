// V9c / V9c-T — prompt-mode conversation drive and active-set gating seam.
//
// This module owns the PIC-17 active-set install-vector computation, the
// process-global `pi.on` cancel-forwarding subscription, and the untyped-query
// trailing-turn `Ok(string)` extraction
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
//     bug 0372 §Fix): every production caller threads this module's computed
//     install vector into that gate rather than restoring bare.
//   - PIC-2 prompt-mode sequential execution: within a single user session no
//     two prompt-mode bodies hold an open snapshot/restore window at a time —
//     a nested prompt → prompt `invoke(...)` opens its window only after the
//     parent body's window has been restored (cross-body non-overlap).
//   - PIC-18 prompt-mode turn-lifecycle event subscription: the driver observes
//     the five turn-lifecycle events through the factory-captured `ExtensionAPI`
//     `pi.on`, process-global with no per-session origin marker, and uses them
//     ONLY to forward the active invocation's captured signal into the V17a
//     `thetaAbort` controller — never to resolve query completion.
//   - PIC-53 untyped-query `Ok(string)` trailing-turn extraction: the value is
//     the accumulated assistant text of the final turn.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-2, PIC-18, PIC-53);
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
 * parameter here — it is never unioned into the install. Exported: every
 * production gating-window caller (`withActiveSetGate`,
 * `../runtime/tool-registration.ts`) computes its `installVector` through this
 * function rather than re-deriving the vector shape at each call site.
 */
export function computeActiveSetInstall(install: CallableSetInstall): string[] {
  const names = [...install.thetaCallableSetNames];
  if (install.respondToolName !== undefined) {
    names.push(install.respondToolName);
  }
  return names;
}

// ---------------------------------------------------------------------------
// PIC-18 — prompt-mode turn-lifecycle event subscription (cancel-forward only).
// ---------------------------------------------------------------------------

/**
 * The five turn-lifecycle events the prompt-mode driver observes through
 * `pi.on` (PIC-18). theta 1.0 consumes exactly these members and no others.
 */
export type PromptModeLifecycleEvent =
  | "tool_call"
  | "tool_result"
  | "message_update"
  | "turn_end"
  | "agent_end";

/** The closed, ordered list of the five PIC-18 turn-lifecycle events. */
export const PROMPT_MODE_LIFECYCLE_EVENTS: readonly PromptModeLifecycleEvent[] = Object.freeze([
  "tool_call",
  "tool_result",
  "message_update",
  "turn_end",
  "agent_end",
] as const);

/**
 * The subset of Pi's `ExtensionAPI` the prompt-mode subscription touches: the
 * process-global `pi.on(event, handler)` surface. Each overload returns `void`
 * and carries no per-session origin marker (PIC-18).
 */
export interface PromptModeEventApi {
  on(event: string, handler: () => void): void;
}

/**
 * The active invocation's cancellation signals: the captured per-handler
 * `ctx.signal` the lifecycle handlers re-check, and the V17a-owned `thetaAbort`
 * controller the abort is forwarded into.
 */
export interface ActiveInvocationSignals {
  readonly capturedSignal: AbortSignal;
  readonly thetaAbort: AbortController;
}

/**
 * Register the process-global prompt-mode turn-lifecycle subscription (PIC-18).
 * The handlers exist ONLY to forward the active invocation's captured
 * `ctx.signal` into its V17a `thetaAbort` controller; they never resolve query
 * completion (that is `waitForIdle`'s job). Because `pi.on` events are
 * process-global and carry no per-session origin marker, a cross-fire from an
 * unrelated session is harmless — it triggers only a re-check of a non-aborted
 * captured signal.
 */
export function subscribePromptModeCancelForwarding(
  eventApi: PromptModeEventApi,
  getActiveInvocation: () => ActiveInvocationSignals | undefined,
): void {
  // PIC-18: register each of the five turn-lifecycle events under its bare,
  // process-global name (no per-session origin marker). Each handler's sole
  // role is cancel-forwarding: re-check the active invocation's captured
  // `ctx.signal` and, if it has aborted, forward that abort into the V17a
  // `thetaAbort` controller. It never resolves query completion.
  for (const event of PROMPT_MODE_LIFECYCLE_EVENTS) {
    eventApi.on(event, () => {
      const invocation = getActiveInvocation();
      if (invocation === undefined) {
        return;
      }
      // Forward only on a genuine abort; a cross-fire from an unrelated
      // session's turn event on a non-aborted signal is a harmless no-op. The
      // `thetaAbort.signal.aborted` guard makes a re-entrant forward idempotent
      // (the first reason is retained).
      if (invocation.capturedSignal.aborted && !invocation.thetaAbort.signal.aborted) {
        invocation.thetaAbort.abort(invocation.capturedSignal.reason);
      }
    });
  }
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
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("");
    assistantTexts.push(text);
  }
  return assistantTexts.join("\n");
}
