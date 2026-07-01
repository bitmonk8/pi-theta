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
// V9c-T (this tests-task) declares the seam and stubs each entry NON-COMPLIANTLY
// so the paired tests red on their own primary assertions while the V9c
// implementation is absent:
//   - `withActiveSetGating` unions the ambient snapshot into the install vector
//     (violating PIC-17's "not inherited") and omits the `finally` restore
//     (violating PIC-17's restore and leaving windows open so PIC-2 detects
//     cross-body overlap);
//   - `subscribePromptModeCancelForwarding` registers per-session-marked event
//     names (violating PIC-18's process-global / no-marker) and its handlers
//     never forward the captured abort into `loomAbort` (violating PIC-18's
//     cancel-forwarding role);
//   - `extractTrailingTurnText` returns a fixed sentinel rather than the
//     trailing turn's assistant text (violating PIC-53).
// The paired V9c implementation leaf replaces these bodies with the compliant
// behaviour. No test reds on a compile error, a missing fixture, or a harness
// throw.
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
 *
 * V9c-T stub: unions the ambient snapshot into the install vector (PIC-17
 * violation) and omits the `finally` restore, leaving the window open (PIC-17 +
 * PIC-2 violations).
 */
export async function withActiveSetGating<T>(
  gate: ActiveToolSet,
  install: CallableSetInstall,
  query: () => Promise<T>,
): Promise<T> {
  const snapshot = gate.getActiveTools();
  // STUB (V9c-T): NON-COMPLIANT. The compliant impl installs exactly
  // `computeActiveSetInstall(install)` (no snapshot member) and restores the
  // snapshot in a `finally`. This stub unions the ambient snapshot into the
  // install (so PIC-17's "not inherited" reds) and never restores (so PIC-17's
  // restore assertion and PIC-2's cross-body non-overlap both red).
  const installed = [...snapshot, ...computeActiveSetInstall(install)];
  gate.setActiveTools(installed);
  return await query();
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
 *
 * V9c-T stub: NON-COMPLIANT. Registers per-session-marked event names (PIC-18
 * process-global / no-marker violation) and handlers that never forward the
 * captured abort into `loomAbort` (PIC-18 cancel-forwarding violation).
 */
export function subscribePromptModeCancelForwarding(
  pi: PromptModeEventApi,
  getActiveInvocation: () => ActiveInvocationSignals | undefined,
): void {
  // STUB (V9c-T): NON-COMPLIANT. The compliant impl registers each of the five
  // events under its bare, process-global name and wires each handler to
  // re-check the captured signal and forward its abort into `loomAbort`. This
  // stub appends a per-session marker to every event name and installs a
  // handler that never touches `loomAbort`, so the process-global / no-marker
  // and cancel-forwarding assertions both red.
  let marker = 0;
  for (const event of PROMPT_MODE_LIFECYCLE_EVENTS) {
    pi.on(`${event}#session-${marker}`, () => {
      // Non-compliant: consult the invocation but never forward the abort.
      void getActiveInvocation();
    });
    marker += 1;
  }
}

// ---------------------------------------------------------------------------
// PIC-53 — untyped-query `Ok(string)` trailing-turn extraction.
// ---------------------------------------------------------------------------

/**
 * The V9c-T stub's sentinel return for `extractTrailingTurnText`. It equals no
 * spec-correct extraction (including the empty-string pure-tool-use turn), so
 * every PIC-53 assertion reds while the V9c implementation is absent.
 */
export const TRAILING_TURN_EXTRACTION_STUB = "<v9c-stub: trailing-turn extraction not implemented>";

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
 *
 * V9c-T stub: returns `TRAILING_TURN_EXTRACTION_STUB` regardless of input, so
 * every PIC-53 assertion reds on its own primary assertion.
 */
export function extractTrailingTurnText(messages: readonly Message[]): string {
  // STUB (V9c-T): NON-COMPLIANT. The compliant impl selects the trailing turn
  // (from the last `user` message onward), concatenates the text of every
  // assistant message in it (omitting thinking + toolCalls) with `\n`, and
  // yields `""` for a pure tool-use turn. This stub ignores `messages` and
  // returns a fixed sentinel that matches no correct extraction.
  void messages;
  return TRAILING_TURN_EXTRACTION_STUB;
}
