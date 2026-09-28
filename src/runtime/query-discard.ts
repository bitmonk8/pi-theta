// V13g / V13g-T — discard observability.
//
// This module owns the runtime half of the discarded-query discipline from
// query/query-escapes-stringification.md; the QRY-19 parse-time half (the
// `theta/parse/discarded-query-result` parse error on a bare `@`...``
// expression-statement, `checkDiscardedQueryResult`) lives in
// src/parser/query-discard-checks.ts.
//
//   - QRY-20 — the discard-observability contract: `let _ = @`...`` (and the
//     equivalent `void`-tail form) is a true discard at the user-facing surface
//     (no user-visible `theta-system-note`, no `Result` to the caller), but an
//     `Err` from a discarded query is preserved as an operator-facing runtime
//     event on the always-log `theta-system-note` channel with `display: false`.
//     The event fires exactly once per discarded `Err`, preserves the discarded
//     `Err`'s `kind` / `message` (and `code` / `attempts` / `tokens_used` where
//     defined), and stamps the `RuntimeEvent` `discard_site` field with the
//     location of the discarding `let _ =` binding (or the tail `@`...``
//     expression, for the void-tail form). A discarded `Ok` produces no event.
//
// V13g-T (tests-task) declared the seam shapes; V13g (this leaf) supplies the
// behaviour-bearing function: `emitDiscardObservability` emits the
// `display: false` QRY-20 event preserving `kind` / `message` / `discard_site`
// on an `Err` and nothing on an `Ok`.
//
// Spec: query/query-escapes-stringification.md (QRY-20),
// pi-integration-contract/runtime-event-channel.md §"Runtime event channel".

import { type QueryError } from "./query-error";
import {
  emitRuntimeEvent,
  type RuntimeEvent,
} from "./runtime-event-channel";
import { type SystemNoteChannelDeps } from "../extension/system-note-channel";

// --- QRY-20 — discard observability ----------------------------------------

/**
 * A source location on the `RuntimeEvent` `discard_site` field (the same shape
 * as `query_site`).
 */
export interface DiscardSite {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/**
 * The settled outcome of a discarded query: `Ok` (nothing to observe) or `Err`
 * carrying the `QueryError` whose `kind` / `message` the event preserves.
 */
export type DiscardedOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: QueryError };

/** Inputs to the discard-observability emission (QRY-20). */
export interface DiscardEmitInput {
  /** The settled query outcome. */
  readonly outcome: DiscardedOutcome;
  /**
   * The `discard_site` location, derived upstream per the discard form (QRY-20):
   * the discarding `let _ =` binding for the expression-statement form, or the
   * start of the tail `@`...`` expression for the void-tail-function form.
   */
  readonly discardSite: DiscardSite;
  /** Slash name of the theta that owned the failure. */
  readonly theta: string;
  /** Per-invocation UUID (canonical lowercase 8-4-4-4-12 hex). */
  readonly invocationId: string;
  /** Unix epoch ms stamped at the originating site via `Clock.wallNow()`. */
  readonly occurredAt: number;
  /** Source location of the discarded `@`-template, when known. */
  readonly querySite?: DiscardSite;
}

/**
 * QRY-20. Build the `RuntimeEvent` for a discarded `Err`, preserving the
 * discarded `Err`'s `kind` and `message` (and `code` / `attempts` /
 * `tokens_used` where the variant defines them) and stamping `discard_site`
 * with the discard location.
 */
export function buildDiscardEvent(
  error: QueryError,
  input: DiscardEmitInput,
): RuntimeEvent {
  // QRY-20: preserve the discarded `Err`'s `kind` and `message`, and (where the
  // variant defines them) its `attempts` (validation) / `tokens_used`
  // (context_overflow), and stamp `discard_site` with the discard location. The
  // group-A `RuntimeEvent` carries no `theta/runtime/*` code by construction, so
  // `code` is populated only when the error variant surfaces one.
  const event: RuntimeEvent = {
    kind: error.kind,
    theta: input.theta,
    invocation_id: input.invocationId,
    message: error.message,
    discard_site: input.discardSite,
    occurred_at: input.occurredAt,
  };
  if (input.querySite !== undefined) {
    event.query_site = input.querySite;
  }
  if ("attempts" in error && typeof error.attempts === "number") {
    event.attempts = error.attempts;
  }
  if ("tokens_used" in error && typeof error.tokens_used === "number") {
    event.tokens_used = error.tokens_used;
  }
  return event;
}

/**
 * QRY-20. Emit the discard-observability runtime event exactly once when — and
 * only when — a discarded query settles to `Err`, routing it through the
 * operator-facing always-log `theta-system-note` channel with `display: false`.
 * A discarded `Ok` emits nothing (nothing to observe).
 */
export function emitDiscardObservability(
  input: DiscardEmitInput,
  deps: SystemNoteChannelDeps,
): void {
  // QRY-20: a discarded `Ok` has nothing to observe — emit nothing. A discarded
  // `Err` is preserved as an operator-facing runtime event on the always-log
  // `theta-system-note` channel. It is author-handled (the `let _ =` / void-tail
  // discard is a disposition, not a top-level cascade), so it emits with
  // `topLevelCascade: false` — the note carries `display: false` and
  // `content: ""`.
  if (input.outcome.ok) {
    return;
  }
  const event = buildDiscardEvent(input.outcome.error, input);
  emitRuntimeEvent(event, { topLevelCascade: false, userFacingTemplate: "" }, deps);
}
