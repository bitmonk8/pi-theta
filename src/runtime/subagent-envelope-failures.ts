// RFC-0006 — subagent envelope diagnostic codes and failure mappings (PIC-59).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderHostDerivedTail } from "../diagnostics/placeholder";
import type { InvokeInfraError } from "./query-error";

// ---------------------------------------------------------------------------
// Diagnostic codes (RFC 0006 marshalling codes).
// ---------------------------------------------------------------------------

/** `theta/runtime/subagent-envelope-parse-failed` — a reserved-key line did not parse against the pinned return-envelope schema. */
export const SUBAGENT_ENVELOPE_PARSE_FAILED_CODE = "theta/runtime/subagent-envelope-parse-failed";

/**
 * `theta/runtime/subagent-wire-parse-failed` — a *non-envelope* stdout line was
 * expected to be a `--mode json` event and did not parse as JSON (bug 0086).
 * Distinct family from the four RFC 0006 marshalling codes above: this one
 * covers the line class {@link classifyChildStdoutLine} answers `unparseable`
 * for, never a reserved-key line (that failure is
 * {@link SUBAGENT_ENVELOPE_PARSE_FAILED_CODE} instead).
 */
export const SUBAGENT_WIRE_PARSE_FAILED_CODE = "theta/runtime/subagent-wire-parse-failed";

/** `theta/runtime/subagent-envelope-schema-skew` — envelope version the parent does not recognise. */
export const SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE = "theta/runtime/subagent-envelope-schema-skew";

/** `theta/runtime/subagent-exit-without-envelope` — child exited without emitting an envelope. */
export const SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE = "theta/runtime/subagent-exit-without-envelope";

/** `theta/runtime/subagent-return-value-not-representable` — a terminal `Ok` payload carries a non-finite `number`. */
export const SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE = "theta/runtime/subagent-return-value-not-representable";

// ---------------------------------------------------------------------------
// Fail-closed failure-class mappings (PIC-59, INV-5).
// ---------------------------------------------------------------------------

/** Truncated rendering of an offending envelope line for the parse-failure diagnostic. */
function summarizeLine(line: string): string {
  const MAX = 120;
  return line.length > MAX ? `${line.slice(0, MAX)}\u2026` : line;
}

/** A fail-closed mapping: the reconstructed `Err` plus its operator-triage diagnostic. */
export interface EnvelopeFailureMapping {
  readonly error: InvokeInfraError;
  readonly diagnostic: Diagnostic;
}

/**
 * Map a reserved-key envelope line that fails return-envelope parsing to
 * `Err(InvokeInfraError { cause: "internal_error" })` + the
 * `theta/runtime/subagent-envelope-parse-failed` diagnostic (fail-closed; the
 * `<line summary>` tail is category-8 host-derived, per the sibling below).
 */
export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
  const summary = summarizeLine(renderHostDerivedTail(line));
  const message = `subagent return envelope parse failed: ${summary}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
      message,
    },
  };
}

/**
 * Map a *non-envelope* stdout line {@link classifyChildStdoutLine} answered
 * `unparseable` for to the advisory `theta/runtime/subagent-wire-parse-failed`
 * diagnostic (bug 0086 §Fix disposition 1). ADVISORY TRIAGE, not a fail-closed
 * mapping: unlike every `EnvelopeFailureMapping` builder above, this returns a
 * `Diagnostic` alone — the registry row states the parent ignores stray
 * non-envelope lines by construction (PIC-59), so the invocation result does
 * not change on this line class, and there is no `Err` to reconstruct. The
 * caller (`driveSubagentChild`) owns the per-invocation emission bound; this
 * builder answers only what one offending line renders as.
 */
export function mapWireParseFailure(line: string): Diagnostic {
  // `<line summary>` is a category-8 host-derived tail, which
  // placeholder-rendering-b.md §8 pins to category 6's first-line truncation:
  // newline-normalise (`\r\n` and bare `\r` become `\n`), then cut at the first
  // break. The production line pump splits on `\n` alone and leaves a trailing
  // CR for this parser to trim, so a co-process writing `garbage\r\n` delivers
  // the line `garbage\r` here and that CR must not reach the operator. The rule
  // is single-sourced in `renderHostDerivedTail`; `summarizeLine` then applies
  // the length cap §8 leaves implementation-defined at the byte level. The
  // rule's `<no message>` empty arm is answered by that shared renderer, so no
  // arm for it is written here — and the driver's blank-line filter takes every
  // all-JSON-whitespace line before this builder runs, leaving a leading bare
  // CR as its only route.
  const summary = summarizeLine(renderHostDerivedTail(line));
  return {
    severity: "error",
    code: SUBAGENT_WIRE_PARSE_FAILED_CODE,
    message: `subagent event-stream line parse failed: ${summary}`,
  };
}

/**
 * Map an envelope schema-version skew to `Err(InvokeInfraError { cause:
 * "internal_error" })` + the `theta/runtime/subagent-envelope-schema-skew`
 * diagnostic (fail-closed; skew is detected, not tolerated).
 */
export function mapEnvelopeSchemaSkew(
  observed: number,
  required: number,
  calleePath: string,
): EnvelopeFailureMapping {
  const message = `subagent return envelope schema skew: observed version ${observed}, parent requires ${required}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE,
      message,
    },
  };
}

/**
 * Map a child that exited WITHOUT emitting an envelope (crash, kill, timeout) to
 * `Err(InvokeInfraError { cause: "internal_error" })` carrying the exit detail
 * + the `theta/runtime/subagent-exit-without-envelope` diagnostic (fail-closed;
 * never a fabricated `Ok`, PIC-59 / INV-5).
 */
export function mapExitWithoutEnvelope(exitDetail: string, calleePath: string): EnvelopeFailureMapping {
  // Fail-closed: a child that exits WITHOUT an envelope carries the exit detail
  // on the reconstructed `Err` — never a fabricated `Ok` value (PIC-59 / INV-5).
  const message = `subagent child exited without a return envelope: ${exitDetail}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE,
      message,
    },
  };
}
