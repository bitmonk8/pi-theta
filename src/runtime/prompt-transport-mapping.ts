// V9n / V9n-T — prompt-mode transport-error mapping seam.
//
// This module owns the prompt-mode driver's transport-failure synthesis. It
// consumes V9c's trailing-turn `Ok(string)` extraction seam
// (`extractTrailingTurnText`) and builds the `stopReason: "error"` probe over
// the driven turn's trailing `assistant` message, mapping each failure surface
// to its `QueryError` per pi-integration-contract/conversation-drive.md
// §"Error detection":
//
//   - PIC-51 `stopReason: "error"` transport mapping: after `waitForIdle()`
//     resolves, a driven turn whose trailing `assistant` message carries
//     `stopReason: "error"` maps to
//     `Err(QueryError { kind: "transport", message: <errorMessage>,
//      http_status: null, provider: <resolved provider>, retryable: false })`;
//     when `errorMessage` is absent, `message` is the fixed string
//     `"provider transport failure"`. The runtime never classifies it as
//     `theta/runtime/internal-error` and never extracts it as `Ok(string)`.
//   - PIC-51 cancellation short-circuit: when `thetaAbort.signal.aborted` is
//     true the runtime synthesises `Err(QueryError { kind: "cancelled" })` and
//     takes precedence over both the `stopReason: "error"` probe and the
//     `Ok(string)` extraction — even when `waitForIdle()` resolved cleanly with
//     no error written to session state.
//   - PIC-50 synchronous-throw secondary mapping: a synchronous throw from
//     `pi.sendUserMessage` maps to
//     `Err(QueryError { kind: "transport", message: <coerced caught-throw>,
//      http_status: null, provider: <resolved provider>, retryable: false })`,
//     NOT to `theta/runtime/internal-error`. The `message` is derived through the
//     underlying-error coercion rule so a non-Error throw yields a deterministic
//     non-null string.
//
// The synthesised `provider` field is NOT derived here — it is supplied by the
// caller from V9j's provider-error-mapping surface (the resolved
// `Model<Api>.api` value), matching the subagent-mode transport mapping.
//
// V9n-T (tests-task) declares this seam and stubs the two behaviour-bearing
// helpers NON-COMPLIANTLY so the failing tests compile and red on their own
// primary assertions; the paired V9n implementation leaf fills in the
// cancellation short-circuit, the `stopReason: "error"` probe, the
// `"provider transport failure"` fallback, and the coerced sync-throw mapping.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-50, PIC-51);
// errors-and-results/queryerror-variants.md (§TransportError.provider);
// diagnostics/placeholder-rendering-b.md (§underlying-error coercion).

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { CancelledError, QueryError, TransportError } from "./query-error";
import { makeCancelledError } from "./cancellation-core";
import { extractTrailingTurnText } from "./conversation-drive";
import { coerceUnderlyingString } from "../diagnostics/placeholder";

/** The fixed transport `message` when a `stopReason: "error"` turn carries no `errorMessage` (PIC-51). */
export const PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE = "provider transport failure";

// --- Bug 0288 §Fix items 1/2/4 — turn-lifecycle bound-expiry messages -------
//
// Every bound the on-session prompt-mode turn drive waits on
// (production-theta-producer.ts `LivePromptQueryModel.#driveUserVisibleTurn`)
// must fail loudly on expiry rather than let the drive walk out and bind a
// value from a turn that was never observed to run or settle (bug doc P1/P2).
// The registry is closed (DIAG-2), so this reuses the PIC-50/PIC-51
// `TransportError` shape with a FIXED NAMED message per phase instead of
// minting a new diagnostic code. Each stem is a plain exported string so a
// caller (and a test) can check a synthesised message was built from it
// without hardcoding the bound value the message reports.

/** Stem for a pre-send gate expiry: the turn could not even be issued (§Fix item 1). */
export const PROMPT_MODE_PRE_SEND_GATE_EXPIRY_MESSAGE =
  "on-session turn was not issued: the session never went idle before the pre-send gate expired";

/**
 * Stem for a start-poll expiry over an UNSETTLED turn slice (§Fix item 3): the
 * run was never observed non-idle and the turn's own slice never settled
 * either (a settled-inside-one-poll turn is not this failure — see the guard
 * cell in `tests/b0288-prompt-turn-completion-witness.test.ts`).
 */
export const PROMPT_MODE_START_PHASE_EXPIRY_MESSAGE =
  "on-session turn did not start: the run was never observed to begin streaming";

/**
 * Stem for an end/settlement-phase expiry (§Fix item 4): the run started but
 * never went idle again, or it went idle but the turn's own slice never
 * settled within the bounded `waitForIdle` race and the final settle-poll.
 */
export const PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE =
  "on-session turn did not settle: the run never completed and its reply never landed";

/** Which bounded wait in `#driveUserVisibleTurn` expired (§Fix items 1–4). */
export type PromptModeTurnLifecyclePhase = "pre-send-gate" | "start" | "settle";

function phaseStem(phase: PromptModeTurnLifecyclePhase): string {
  switch (phase) {
    case "pre-send-gate":
      return PROMPT_MODE_PRE_SEND_GATE_EXPIRY_MESSAGE;
    case "start":
      return PROMPT_MODE_START_PHASE_EXPIRY_MESSAGE;
    case "settle":
      return PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE;
  }
}

/**
 * Map a bounded turn-lifecycle wait's expiry to a `TransportError` on the
 * PIC-50/PIC-51 register (bug 0288 §Fix items 1–4): `http_status: null`,
 * `retryable: false`, the caller-resolved `provider`, and the phase's fixed
 * named message stem with the elapsed bound (ms) appended so the expiry is
 * diagnosable. No retry is attempted here (§Fix default) — the caller decides
 * whether to re-send, and this repository's chosen default is not to.
 */
export function mapPromptModeTurnLifecycleExpiry(
  phase: PromptModeTurnLifecyclePhase,
  boundMs: number,
  provider: string,
): TransportError {
  return {
    kind: "transport",
    message: `${phaseStem(phase)} (waited ${boundMs}ms)`,
    http_status: null,
    provider,
    retryable: false,
  };
}

/** A prompt-mode untyped query's result: `Ok(string)` or `Err(QueryError)`. */
export type PromptModeQueryResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: QueryError };

/**
 * The live context the post-`waitForIdle()` probe reads its short-circuits
 * from: the `thetaAbort.signal.aborted` cancellation flag and the resolved
 * `Model<Api>.api` provider string (supplied by the caller from V9j's
 * provider-error-mapping surface, per the leaf's `Adds.`).
 */
export interface PromptModeProbeCtx {
  /** `thetaAbort.signal.aborted` — the PIC-51 cancellation short-circuit. */
  readonly aborted: boolean;
  /** The resolved `Model<Api>.api` provider for the transport-failure `Err`. */
  readonly provider: string;
}

/**
 * PIC-51. Extract the prompt-mode untyped query's result from the driven user
 * session's trailing turn after `waitForIdle()` resolves, applying — in this
 * fixed order — the cancellation short-circuit (`ctx.aborted` →
 * `Err(cancelled)`), then the `stopReason: "error"` transport short-circuit
 * (trailing `assistant` `stopReason: "error"` → `Err(transport)`), then the
 * trailing-turn `Ok(string)` extraction (V9c's `extractTrailingTurnText`).
 */
export function extractPromptModeQueryResult(
  messages: readonly Message[],
  probeCtx: PromptModeProbeCtx,
): PromptModeQueryResult {
  // PIC-51 cancellation short-circuit: the post-`waitForIdle` error-state probe
  // runs unconditionally on resolution, but when `thetaAbort.signal.aborted` is
  // true the runtime synthesises `Err(cancelled)` instead of reading session
  // error state — even when Pi tore down cleanly and `waitForIdle()` resolved
  // without any error written. This precedes both the `stopReason: "error"`
  // probe and the `Ok(string)` extraction.
  if (probeCtx.aborted) {
    const cancelled: CancelledError = makeCancelledError();
    return { ok: false, error: cancelled };
  }

  // PIC-51 `stopReason: "error"` transport probe: read the driven turn's final
  // `assistant` message and, when its `stopReason` is `"error"`, map it to a
  // `kind: "transport"` `QueryError` — never `theta/runtime/internal-error`, and
  // never the `Ok(string)` extraction. The `message` is the turn's
  // `errorMessage`, or the fixed fallback when it is absent.
  const trailing = trailingTurnFinalAssistant(messages);
  if (trailing !== undefined && trailing.stopReason === "error") {
    const transport: TransportError = {
      kind: "transport",
      message: trailing.errorMessage ?? PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
      http_status: null,
      provider: probeCtx.provider,
      retryable: false,
    };
    return { ok: false, error: transport };
  }

  // PIC-53: downstream of both short-circuits, the `Ok(string)` value is V9c's
  // trailing-turn assistant-text extraction.
  return { ok: true, value: extractTrailingTurnText(messages) };
}

/**
 * The final `assistant` message of the driven turn — the last `user` message
 * (the theta-issued `pi.sendUserMessage` turn) plus every subsequent message —
 * matching the trailing-turn boundary V9c's `extractTrailingTurnText` uses.
 * `undefined` when the trailing turn carries no `assistant` message at all.
 */
function trailingTurnFinalAssistant(
  messages: readonly Message[],
): AssistantMessage | undefined {
  let turnStart = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      turnStart = i;
      break;
    }
  }
  const turn = turnStart === -1 ? messages : messages.slice(turnStart);
  for (let i = turn.length - 1; i >= 0; i -= 1) {
    const message = turn[i];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

/**
 * PIC-50. Map a synchronous throw from `pi.sendUserMessage` (the only failure
 * mode the call surface itself can signal) to a `TransportError`. `message` is
 * derived from the caught thrown value through the underlying-error coercion
 * rule (object `.message` when string, else `String(v)`, else `<unreadable>`),
 * NOT a raw `.message` read. The throw is never wrapped as
 * `theta/runtime/internal-error`.
 */
export function mapPromptModeSyncThrow(
  caught: unknown,
  provider: string,
): TransportError {
  // PIC-50: map the synchronous throw to a `kind: "transport"` `TransportError`.
  // `message` is derived through the underlying-error coercion rule (object
  // `.message` when string, else `String(v)`, else `<unreadable>`) — NOT a raw
  // `.message` read — so a non-Error throw (a thrown string, a thrown
  // `null`/`undefined`) yields a deterministic non-null string rather than
  // `undefined` or a synchronous TypeError. The throw is never wrapped as
  // `theta/runtime/internal-error`, never allowed to propagate, and never
  // swallowed as a successful `Ok("")`.
  return {
    kind: "transport",
    message: coerceUnderlyingString(caught),
    http_status: null,
    provider,
    retryable: false,
  };
}
