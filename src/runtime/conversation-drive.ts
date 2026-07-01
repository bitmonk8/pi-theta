// V9c / V9c-T — prompt-mode conversation drive and active-set gating seam.
//
// This module owns the prompt-mode driver's active-set gating window, the
// process-global `pi.on` cancel-forwarding subscription, and the untyped-query
// trailing-turn `Ok(string)` extraction
// (pi-integration-contract/conversation-drive.md):
//
//   - PIC-17 active-set allowlist gating: around each query the runtime
//     snapshots `pi.getActiveTools()`, installs exactly
//     `[...loomCallableSetNames, respondToolName?]` via `pi.setActiveTools(...)`
//     (the step-1 snapshot is deliberately NOT unioned into the install — the
//     "ambient tools are deliberately not inherited" invariant), issues the
//     query, and restores the snapshot in a `finally` so cancellation / panic /
//     provider exceptions all preserve the invariant.
//   - PIC-2 prompt-mode sequential execution: within a single user session no
//     two prompt-mode bodies hold an open snapshot/restore window at a time —
//     a nested prompt → prompt `invoke(...)` opens its window only after the
//     parent body's window has been restored (cross-body non-overlap).
//   - PIC-18 prompt-mode turn-lifecycle event subscription: the driver observes
//     the five turn-lifecycle events through the factory-captured `ExtensionAPI`
//     `pi.on`, process-global with no per-session origin marker, and uses them
//     ONLY to forward the active invocation's captured signal into the V17a
//     `loomAbort` controller — never to resolve query completion.
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
 * The subset of Pi's `ExtensionAPI` the active-set gating window touches: the
 * `pi.getActiveTools()` snapshot read and the `pi.setActiveTools(names)` install
 * / restore. Both are pinned as name-list operations by `ExtensionAPI`
 * (tool-registration-lifetime.md); loom holds them by dependency injection.
 */
export interface ActiveToolSet {
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
}

/**
 * The callable set installed for one query's active-set window: the loom's
 * declared callable-set names, plus the synthesised respond tool when the turn
 * is a typed-query forced-respond turn. The step-1 snapshot is NOT a member —
 * ambient tools are deliberately not inherited (PIC-17).
 */
export interface CallableSetInstall {
  readonly loomCallableSetNames: readonly string[];
  readonly respondToolName?: string;
}

/**
 * Compute the PIC-17 step-2 install vector: exactly
 * `[...loomCallableSetNames, respondToolName?]`, with the respond tool appended
 * last only on a forced-respond turn. The ambient snapshot is deliberately not a
 * parameter here — it is never unioned into the install. Internal to the gating
 * window; not exported, so no speculative API surfaces beyond `withActiveSetGating`.
 */
function computeActiveSetInstall(install: CallableSetInstall): string[] {
  const names = [...install.loomCallableSetNames];
  if (install.respondToolName !== undefined) {
    names.push(install.respondToolName);
  }
  return names;
}

/**
 * Run one query inside the PIC-17 active-set gating window: snapshot the current
 * active tools, install exactly the loom's callable set (plus the respond tool
 * when present), issue the query, and restore the snapshot in a `finally` (so
 * cancellation, panic, and provider exceptions all preserve the invariant). The
 * snapshot is held only for the restore and is not unioned into the install —
 * ambient tools are not inherited. Because the restore closes the window before
 * this call returns, two prompt-mode bodies against the same session can never
 * hold an open window simultaneously (PIC-2).
 */
export async function withActiveSetGating<T>(
  gate: ActiveToolSet,
  install: CallableSetInstall,
  query: () => Promise<T>,
): Promise<T> {
  // PIC-17 step 1: snapshot the ambient active-set. Held only for the step-4
  // restore — never unioned into the install (ambient tools not inherited).
  const snapshot = gate.getActiveTools();
  // PIC-17 step 2: install exactly the loom's callable set (plus the respond
  // tool on a forced-respond turn).
  gate.setActiveTools(computeActiveSetInstall(install));
  try {
    // PIC-17 step 3: issue the query inside the open window.
    return await query();
  } finally {
    // PIC-17 step 4: restore the exact step-1 snapshot so cancellation, panic,
    // and provider exceptions all preserve the invariant and close the window
    // before this call returns (PIC-2 cross-body non-overlap).
    gate.setActiveTools(snapshot);
  }
}

// ---------------------------------------------------------------------------
// PIC-18 — prompt-mode turn-lifecycle event subscription (cancel-forward only).
// ---------------------------------------------------------------------------

/**
 * The five turn-lifecycle events the prompt-mode driver observes through
 * `pi.on` (PIC-18). loom 1.0 consumes exactly these members and no others.
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
 * `ctx.signal` the lifecycle handlers re-check, and the V17a-owned `loomAbort`
 * controller the abort is forwarded into.
 */
export interface ActiveInvocationSignals {
  readonly capturedSignal: AbortSignal;
  readonly loomAbort: AbortController;
}

/**
 * Register the process-global prompt-mode turn-lifecycle subscription (PIC-18).
 * The handlers exist ONLY to forward the active invocation's captured
 * `ctx.signal` into its V17a `loomAbort` controller; they never resolve query
 * completion (that is `waitForIdle`'s job). Because `pi.on` events are
 * process-global and carry no per-session origin marker, a cross-fire from an
 * unrelated session is harmless — it triggers only a re-check of a non-aborted
 * captured signal.
 */
export function subscribePromptModeCancelForwarding(
  pi: PromptModeEventApi,
  getActiveInvocation: () => ActiveInvocationSignals | undefined,
): void {
  // PIC-18: register each of the five turn-lifecycle events under its bare,
  // process-global name (no per-session origin marker). Each handler's sole
  // role is cancel-forwarding: re-check the active invocation's captured
  // `ctx.signal` and, if it has aborted, forward that abort into the V17a
  // `loomAbort` controller. It never resolves query completion.
  for (const event of PROMPT_MODE_LIFECYCLE_EVENTS) {
    pi.on(event, () => {
      const invocation = getActiveInvocation();
      if (invocation === undefined) {
        return;
      }
      // Forward only on a genuine abort; a cross-fire from an unrelated
      // session's turn event on a non-aborted signal is a harmless no-op. The
      // `loomAbort.signal.aborted` guard makes a re-entrant forward idempotent
      // (the first reason is retained).
      if (invocation.capturedSignal.aborted && !invocation.loomAbort.signal.aborted) {
        invocation.loomAbort.abort(invocation.capturedSignal.reason);
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
  // PIC-53: the final turn is the last `user` message (the loom-issued
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
