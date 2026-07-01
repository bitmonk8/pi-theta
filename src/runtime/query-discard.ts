// V13g / V13g-T — discarded-query result discipline and discard observability.
//
// This module owns two coupled obligations from
// query/query-escapes-stringification.md:
//
//   - QRY-19 — the `loom/parse/discarded-query-result` parse error on a bare
//     `@`...`` expression-statement (the `Result` dropped without `?`,
//     `let _ =`, or an annotation). Only the bare expression-statement position
//     triggers the error; the `?`-propagate, `let _ =`-discard, and
//     `let x = ...?`-bind forms are all accepted.
//   - QRY-20 — the discard-observability contract: `let _ = @`...`` (and the
//     equivalent `void`-tail form) is a true discard at the user-facing surface
//     (no user-visible `loom-system-note`, no `Result` to the caller), but an
//     `Err` from a discarded query is preserved as an operator-facing runtime
//     event on the always-log `loom-system-note` channel with `display: false`.
//     The event fires exactly once per discarded `Err`, preserves the discarded
//     `Err`'s `kind` / `message` (and `code` / `attempts` / `tokens_used` where
//     defined), and stamps the `RuntimeEvent` `discard_site` field with the
//     location of the discarding `let _ =` binding (or the tail `@`...``
//     expression, for the void-tail form). A discarded `Ok` produces no event.
//
// V13g-T (this tests-task) declares the seam shapes and stubs the two
// behaviour-bearing functions inertly so the failing tests compile and red on
// their own primary assertions:
//   - `checkDiscardedQueryResult` returns `undefined` always (never fires the
//     parse error), so the QRY-19 positive assertion reds.
//   - `emitDiscardObservability` unconditionally emits one sentinel event with
//     `display: true` and a payload that preserves neither `kind` / `message`
//     nor `discard_site`, so both the QRY-20 `Err`-arm assertions (wrong
//     display / kind / message / discard_site) and the `Ok`-arm assertion (an
//     `Ok` discard must emit nothing) red.
// The paired V13g implementation leaf fills these in.
//
// Spec: query/query-escapes-stringification.md (QRY-19, QRY-20),
// pi-integration-contract/runtime-event-channel.md §"Runtime event channel".

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type QueryError } from "./query-error";
import {
  emitRuntimeEvent,
  type RuntimeEvent,
} from "./runtime-event-channel";
import { type SystemNoteChannelDeps } from "../extension/system-note-channel";

// --- QRY-19 — discarded-query parse error ----------------------------------

/** `loom/parse/discarded-query-result` (E). */
export const DISCARDED_QUERY_RESULT_CODE = "loom/parse/discarded-query-result";

/**
 * Registry Message for `loom/parse/discarded-query-result`, sourced verbatim
 * from diagnostics/code-registry-parse.md per the Diagnostic message anchors
 * rule.
 */
export const DISCARDED_QUERY_RESULT_MESSAGE =
  "query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly";

/** Registry Hint for `loom/parse/discarded-query-result`. */
export const DISCARDED_QUERY_RESULT_HINT =
  "Use `?` to propagate failure or `let _ = @`...`` to discard explicitly.";

/**
 * The statement-position disposition of a query (`@`...``) result (QRY-19). Only
 * the bare expression-statement position triggers the parse error; the other
 * three forms acknowledge the `Result` at the call site.
 */
export type QueryStatementDisposition =
  /** `@`...`` alone in statement position — the `Result` is dropped. */
  | "bare-expr-statement"
  /** `@`...``? — early-return propagation. */
  | "propagate"
  /** `let _ = @`...`` — explicit discard of both `Ok` and `Err`. */
  | "discard-let-underscore"
  /** `let x = @`...``? — bind the success value. */
  | "bind";

/**
 * A statement whose expression may be a must-use `@`...`` query result, with
 * the disposition the author gave it and its source location.
 */
export interface QueryStatement {
  /** Whether the statement's expression is a must-use `@`...`` query result. */
  readonly isQuery: boolean;
  /** The disposition the author chose at the call site. */
  readonly disposition: QueryStatementDisposition;
  /** Source file of the statement. */
  readonly file: string;
  /** Source range of the statement (used as the diagnostic location). */
  readonly range: SourceRange;
}

/**
 * QRY-19. Return `loom/parse/discarded-query-result` when a must-use `@`...``
 * query result sits in bare expression-statement position; `undefined` for the
 * `?`-propagate, `let _ =`-discard, and `let x = ...?`-bind forms (and for any
 * non-query statement).
 */
export function checkDiscardedQueryResult(
  stmt: QueryStatement,
): Diagnostic | undefined {
  // Inert V13g-T stub: never fires. The paired V13g impl returns the
  // `loom/parse/discarded-query-result` diagnostic iff
  // `stmt.isQuery && stmt.disposition === "bare-expr-statement"`.
  void stmt;
  return undefined;
}

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
 * Which discard form produced the observability event (QRY-20). The
 * `discard_site` is the location of the discarding `let _ =` binding for the
 * expression-statement form, or the start of the tail `@`...`` expression for
 * the void-tail-function form.
 */
export type DiscardForm = "let-underscore" | "void-tail";

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
  /** The discard form (selects the `discard_site` derivation upstream). */
  readonly form: DiscardForm;
  /** The `discard_site` location (already derived per `form`). */
  readonly discardSite: DiscardSite;
  /** Slash name of the loom that owned the failure. */
  readonly loom: string;
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
  // Inert V13g-T stub: a sentinel event that preserves neither `kind` /
  // `message` nor `discard_site`, so the QRY-20 payload assertions red. The
  // paired V13g impl copies `error.kind` / `error.message` (+ `code` /
  // `attempts` / `tokens_used`) and stamps `discard_site: input.discardSite`.
  void error;
  return {
    kind: "unimplemented",
    loom: input.loom,
    invocation_id: input.invocationId,
    message: "unimplemented",
    occurred_at: input.occurredAt,
  };
}

/**
 * QRY-20. Emit the discard-observability runtime event exactly once when — and
 * only when — a discarded query settles to `Err`, routing it through the
 * operator-facing always-log `loom-system-note` channel with `display: false`.
 * A discarded `Ok` emits nothing (nothing to observe).
 */
export function emitDiscardObservability(
  input: DiscardEmitInput,
  deps: SystemNoteChannelDeps,
): void {
  // Inert V13g-T stub: unconditionally emit one sentinel event with
  // `display: true` (topLevelCascade), regardless of `Ok`/`Err`. This reds both
  // the `Err`-arm assertions (wrong display / kind / message / discard_site)
  // and the `Ok`-arm assertion (a discarded `Ok` must emit nothing). The paired
  // V13g impl guards on `!input.outcome.ok`, builds the event via
  // `buildDiscardEvent`, and emits with `topLevelCascade: false` so the note
  // carries `display: false` and `content: ""`.
  const sentinel: RuntimeEvent = {
    kind: "unimplemented",
    loom: input.loom,
    invocation_id: input.invocationId,
    message: "unimplemented",
    occurred_at: input.occurredAt,
  };
  emitRuntimeEvent(
    sentinel,
    { topLevelCascade: true, userFacingTemplate: "unimplemented" },
    deps,
  );
}
