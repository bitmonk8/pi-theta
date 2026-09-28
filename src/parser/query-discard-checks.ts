// QRY-19 — the discarded-query parse check.
//
// This module owns the `theta/parse/discarded-query-result` parse error on a
// bare `@`...`` expression-statement (the `Result` dropped without `?`,
// `let _ =`, or an annotation): its registry code / message / hint, the
// statement-disposition input shape, and `checkDiscardedQueryResult`, which the
// parser's structural walk (structural-checks.ts) calls on each query
// statement. Only the bare expression-statement position triggers the error;
// the `?`-propagate, `let _ =`-discard, and `let x = ...?`-bind forms are all
// accepted. The QRY-20 runtime discard-observability half stays in
// src/runtime/query-discard.ts.
//
// Spec: query/query-escapes-stringification.md (QRY-19).

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

// --- QRY-19 — discarded-query parse error ----------------------------------

/** `theta/parse/discarded-query-result` (E). */
export const DISCARDED_QUERY_RESULT_CODE = "theta/parse/discarded-query-result";

/**
 * Registry Message for `theta/parse/discarded-query-result`, sourced verbatim
 * from diagnostics/code-registry-parse.md per the Diagnostic message anchors
 * rule.
 */
export const DISCARDED_QUERY_RESULT_MESSAGE =
  "query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly";

/** Registry Hint for `theta/parse/discarded-query-result`. */
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
 * QRY-19. Return `theta/parse/discarded-query-result` when a must-use `@`...``
 * query result sits in bare expression-statement position; `undefined` for the
 * `?`-propagate, `let _ =`-discard, and `let x = ...?`-bind forms (and for any
 * non-query statement).
 */
export function checkDiscardedQueryResult(
  stmt: QueryStatement,
): Diagnostic | undefined {
  // QRY-19: only a must-use `@`...`` query result in bare expression-statement
  // position drops the `Result` without acknowledgement. The `?`-propagate,
  // `let _ =`-discard, and `let x = ...?`-bind forms acknowledge it at the call
  // site and are accepted.
  if (!stmt.isQuery || stmt.disposition !== "bare-expr-statement") {
    return undefined;
  }
  return {
    severity: "error",
    code: DISCARDED_QUERY_RESULT_CODE,
    file: stmt.file,
    range: stmt.range,
    message: DISCARDED_QUERY_RESULT_MESSAGE,
    hint: DISCARDED_QUERY_RESULT_HINT,
  };
}
