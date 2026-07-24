// RFC-0006 — subagent return-value envelope (PIC-59) seam.
//
// The child theta emits a single machine-readable envelope as ONE JSONL line
// with the reserved top-level key `theta_result` on stdout, alongside the
// `--mode json` event stream; the parent matches the reserved key and ignores
// every other line. This module owns:
//
//   - the reserved-key constant and the pinned, versioned envelope schema;
//   - child-side serialisation of an `Ok` value / an `Err` `QueryError`
//     (`serializeOkEnvelope` / `serializeErrEnvelope`) as one JSONL line;
//   - parent-side reserved-key matching + line parsing (`lineCarriesReservedKey`,
//     `parseEnvelopeLine`) and stray-line-tolerant stream scanning
//     (`scanStreamForEnvelope`);
//   - versioning + skew detection (a version the parent does not recognise is
//     detected, not tolerated);
//   - the fail-closed mappings to `Err(InvokeInfraError { cause:
//     "internal_error" })` for the three failure classes — envelope parse
//     failure, envelope schema skew, and child exit WITHOUT an envelope — with
//     their pinned diagnostics.
//
// WHY this succeeds the RFC-0005 RPC-drive wire module: under RFC 0006 the
// child owns its whole interpreter and the parent resolves nothing per-query —
// it consumes only this final-value envelope (PIC-59). The parent-side subagent
// contract reduces to envelope consumption.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, #subagent-return-envelope,
// #subagent-error-fidelity, #subagent-cli-wire-pins), invocation.md (INV-5),
// errors-and-results/queryerror-variants.md (the `err` arm mirrors the
// `QueryError` union), diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-envelope-parse-failed`,
// `theta/runtime/subagent-envelope-schema-skew`,
// `theta/runtime/subagent-exit-without-envelope`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError, QueryError } from "./query-error";

// ---------------------------------------------------------------------------
// Reserved key + pinned, versioned schema.
// ---------------------------------------------------------------------------

/** The reserved top-level key that identifies the return-value envelope line (PIC-59). */
export const THETA_RESULT_KEY = "theta_result";

/**
 * The pinned envelope schema version. Parent and child assert compatibility on
 * this field; because the same installed theta extension serves both sides, a
 * version the parent does not recognise arises only from a concurrent upgrade
 * and is detected, not tolerated (PIC-59 versioning + skew detection).
 */
export const THETA_ENVELOPE_VERSION = 1;

/** The `ok` arm of the envelope payload: the child's final value, JSON-representable by construction. */
export interface EnvelopeOk {
  readonly v: number;
  readonly ok: unknown;
}

/** The `err` arm of the envelope payload: a `QueryError` (the `err` arm mirrors the union). */
export interface EnvelopeErr {
  readonly v: number;
  readonly err: QueryError;
}

/** The pinned `theta_result` payload — exactly one of the `ok` / `err` arms, plus the version field. */
export type ThetaResultPayload = EnvelopeOk | EnvelopeErr;

/** One full envelope line's parsed object shape (`{ theta_result: … }`). */
export interface EnvelopeLine {
  readonly theta_result: ThetaResultPayload;
}

// ---------------------------------------------------------------------------
// Diagnostic codes (RFC 0006 marshalling codes).
// ---------------------------------------------------------------------------

/** `theta/runtime/subagent-envelope-parse-failed` — a reserved-key line failed the pinned schema. */
export const SUBAGENT_ENVELOPE_PARSE_FAILED_CODE = "theta/runtime/subagent-envelope-parse-failed";

/** `theta/runtime/subagent-envelope-schema-skew` — envelope version the parent does not recognise. */
export const SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE = "theta/runtime/subagent-envelope-schema-skew";

/** `theta/runtime/subagent-exit-without-envelope` — child exited without emitting an envelope. */
export const SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE = "theta/runtime/subagent-exit-without-envelope";

// ---------------------------------------------------------------------------
// Child-side serialisation.
// ---------------------------------------------------------------------------

/**
 * Serialise the child's `Ok` final value as one JSONL envelope line
 * (`{"theta_result":{"v":<version>,"ok":…}}\n`). `value` is JSON-representable
 * per the runtime value model.
 */
export function serializeOkEnvelope(value: unknown): string {
  const payload: EnvelopeOk = { v: THETA_ENVELOPE_VERSION, ok: value };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}

/**
 * Serialise the child's `Err` value (a `QueryError`) as one JSONL envelope line
 * (`{"theta_result":{"v":<version>,"err":…}}\n`). Every `Err` variant an
 * in-process subagent could surface is representable (PIC-59).
 */
export function serializeErrEnvelope(error: QueryError): string {
  const payload: EnvelopeErr = { v: THETA_ENVELOPE_VERSION, err: error };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}

// ---------------------------------------------------------------------------
// Parent-side matching + parsing.
// ---------------------------------------------------------------------------

/** The parse verdict for one candidate envelope line (a line carrying the reserved key). */
export type EnvelopeParse =
  | { readonly kind: "ok"; readonly value: unknown }
  | { readonly kind: "err"; readonly error: QueryError }
  | { readonly kind: "schema-skew"; readonly observed: number; readonly required: number }
  | { readonly kind: "parse-failed"; readonly line: string };

/**
 * Whether one stdout line carries the reserved `theta_result` top-level key.
 * A line that is not JSON, or is JSON but does not carry the reserved key
 * (a valid `--mode json` event, garbage, or partial JSON), returns `false` —
 * the parent ignores it (stray-line tolerance, PIC-59).
 */
export function lineCarriesReservedKey(line: string): boolean {
  // A line that is not JSON, or is JSON but does not carry the reserved key, is
  // ignored by the parent (stray-line tolerance, PIC-59).
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: stray-line tolerance — pi-integration-contract/subagent.md PIC-59
    void parseError;
    return false;
  }
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    Object.prototype.hasOwnProperty.call(parsed, THETA_RESULT_KEY)
  );
}

/**
 * Parse one reserved-key envelope line against the pinned schema. A version the
 * parent does not recognise yields `schema-skew` (detected, not tolerated); a
 * reserved-key line that does not parse against the pinned schema yields
 * `parse-failed`; otherwise the `ok` / `err` arm.
 */
export function parseEnvelopeLine(line: string): EnvelopeParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: envelope parse failure — pi-integration-contract/subagent.md PIC-59
    void parseError;
    return { kind: "parse-failed", line };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "parse-failed", line };
  }
  const payload = (parsed as Record<string, unknown>)[THETA_RESULT_KEY];
  if (typeof payload !== "object" || payload === null) {
    return { kind: "parse-failed", line };
  }
  const record = payload as Record<string, unknown>;
  const observed = record.v;
  if (typeof observed !== "number") {
    return { kind: "parse-failed", line };
  }
  // Versioning + skew detection: a version the parent does not recognise is
  // detected, not tolerated (PIC-59).
  if (observed !== THETA_ENVELOPE_VERSION) {
    return { kind: "schema-skew", observed, required: THETA_ENVELOPE_VERSION };
  }
  if (Object.prototype.hasOwnProperty.call(record, "ok")) {
    return { kind: "ok", value: record.ok };
  }
  if (Object.prototype.hasOwnProperty.call(record, "err")) {
    return { kind: "err", error: record.err as QueryError };
  }
  // A reserved-key line carrying neither arm fails the pinned schema.
  return { kind: "parse-failed", line };
}

/** The stream-scan verdict: whether a reserved-key envelope line was found, and its parse. */
export type EnvelopeScan =
  | { readonly found: false }
  | { readonly found: true; readonly parse: EnvelopeParse };

/**
 * Scan a captured stdout line stream for the reserved-key envelope, ignoring
 * every non-`theta_result` line (valid JSON events, garbage, partial JSON). The
 * reserved-key line cannot be split mid-write (same-process serialisation), so
 * a single matched line is authoritative.
 */
export function scanStreamForEnvelope(lines: readonly string[]): EnvelopeScan {
  // Ignore every non-`theta_result` line (valid JSON events, garbage, partial
  // JSON); the reserved-key line cannot be split mid-write, so a single matched
  // line is authoritative (PIC-59).
  for (const line of lines) {
    if (lineCarriesReservedKey(line)) {
      return { found: true, parse: parseEnvelopeLine(line) };
    }
  }
  return { found: false };
}

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
 * Map a reserved-key envelope line that failed the pinned schema to
 * `Err(InvokeInfraError { cause: "internal_error" })` + the
 * `theta/runtime/subagent-envelope-parse-failed` diagnostic (fail-closed;
 * never a fabricated value).
 */
export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
  const summary = summarizeLine(line);
  const message = `subagent return envelope failed the pinned schema: ${summary}`;
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
