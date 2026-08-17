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
//   - the fail-closed mappings for four failure classes, each with its pinned
//     diagnostic: envelope parse failure, envelope schema skew and child exit
//     WITHOUT an envelope map to `Err(InvokeInfraError { cause:
//     "internal_error" })`; a terminal `Ok` payload carrying a non-finite
//     `number` maps to `Err(InvokeInfraError { cause: "return_validation" })`
//     instead — a DIFFERENT cause, because that payload is refused as
//     unrepresentable on the wire rather than as an internal defect.
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
// `theta/runtime/subagent-exit-without-envelope`,
// `theta/runtime/subagent-return-value-not-representable`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { MAX_JSON_DEPTH } from "./depth-walk";
import type { InvokeInfraError, QueryError } from "./query-error";
import { isResultValue, type ThetaValue } from "./value";

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

/** The `ok` arm of the envelope payload: the child's final value, whose representability the caller establishes before this envelope is written (`mapNonRepresentableReturnValue`) rather than assuming it by construction. */
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

/** `theta/runtime/subagent-return-value-not-representable` — a terminal `Ok` payload carries a non-finite `number`. */
export const SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE = "theta/runtime/subagent-return-value-not-representable";

// ---------------------------------------------------------------------------
// Child-side serialisation.
// ---------------------------------------------------------------------------

/**
 * Serialise the child's `Ok` final value as one JSONL envelope line
 * (`{"theta_result":{"v":<version>,"ok":…}}\n`). The caller establishes
 * `value`'s representability before calling this: a payload carrying a
 * non-finite `number` anywhere within it is refused
 * (`mapNonRepresentableReturnValue`) rather than reaching `JSON.stringify`,
 * which has no non-finite form and would substitute `null` for a value the
 * callee never produced.
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

// ---------------------------------------------------------------------------
// Non-representable `Ok` payload detection (the `Ok`-values requirement above:
// representability is established here, not assumed by construction).
// ---------------------------------------------------------------------------

/** One non-finite `number` {@link firstNonFiniteNumber} found: its value and RFC-6901 JSON Pointer position (`""` at the payload root). */
interface NonFiniteHit {
  readonly pointer: string;
  readonly value: number;
}

/** RFC 6901 JSON Pointer reference-token escaping: `~` → `~0`, `/` → `~1` (mirrors `depth-walk.ts`'s own escaping). */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Depth-bounded, document-order search for the FIRST non-finite `number`
 * (`Infinity`, `-Infinity`, `NaN`) `value` carries, accumulating `pointer` as
 * an RFC-6901 JSON Pointer on the way down. Mirrors `depth-walk.ts`'s
 * `firstTooDeep` discipline: a level counter with the root at level 1, and one
 * reference token of pointer accumulated per descent.
 *
 * Bounded by `MAX_JSON_DEPTH`, because unbounded recursion inside the envelope
 * writer is forbidden (CIO-3). The bound costs nothing at a TYPED `invoke<T>`
 * return boundary: there a payload nested deeper than the cap is already
 * refused whatever it carries, by the ceiling-#4 depth walk
 * (`enforceInvokeReturnDepth`, `src/runtime/invoke-ceiling-depth.ts:99`), so
 * descending further here could only re-decide a value that gate refuses.
 *
 * That backstop reaches only a boundary that HAS a return type.
 * `#validateInvokeReturn` (`src/extension/production-theta-producer.ts`, named
 * by symbol per bug 0134's positional-drift adjudication) returns before the
 * depth walk when the site names none, and `inferCalleeReturnAnnotation`
 * (`src/parser/functions.ts`) names one only for a schema-constructor or
 * enum-variant tail — so a `.theta`-callable call through `tools:` whose callee
 * tail is anything else (a `let`-bound identifier, an array literal,
 * arithmetic) runs no depth walk at all. A non-finite `number` nested deeper
 * than the cap crosses THAT boundary unrefused, here and parent-side both.
 *
 * A boxed `String` (the `makeEnumValue` enum carrier) holds its wire string,
 * never a `number`, and is not descended. A `Result` is not descended either,
 * mirroring `projectForValidation`'s own `isResultValue` arm
 * (`src/runtime/wire-translation.ts:654`): a `Result` is not a lowerable type
 * form and never crosses the wire by specification. Records with
 * `Object.entries` only — own enumerable string keys — so an
 * interpreter-private brand symbol is never visited.
 */
function firstNonFiniteNumber(
  value: unknown,
  level: number,
  pointer: string,
): NonFiniteHit | undefined {
  if (level > MAX_JSON_DEPTH) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? undefined : { pointer, value };
  }
  if (value instanceof String) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const hit = firstNonFiniteNumber(value[index], level + 1, `${pointer}/${index}`);
      if (hit !== undefined) {
        return hit;
      }
    }
    return undefined;
  }
  if (isResultValue(value as ThetaValue)) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
    const hit = firstNonFiniteNumber(member, level + 1, `${pointer}/${escapePointerToken(key)}`);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

/**
 * Map a terminal `Ok` payload carrying a non-finite `number` — a value
 * `JSON.stringify` has no form for and would substitute `null` into
 * (`serializeOkEnvelope`) — to `Err(InvokeInfraError { cause:
 * "return_validation" })` + the
 * `theta/runtime/subagent-return-value-not-representable` diagnostic, naming
 * the offending value and its RFC-6901 position. `undefined` when every
 * `number` the payload carries is finite, in which case `serializeOkEnvelope`
 * runs unchanged.
 *
 * The message mirrors `refuseParams`'s shape
 * (`src/runtime/subagent-params.ts:304`): the same string on both
 * `error.message` and `diagnostic.message`, with a ` at <pointer>` segment
 * only when the value sits below the payload's root. The rendering is
 * `String(value)` — `Infinity` / `-Infinity` / `NaN` — the interpolation
 * surface's own decision for this class
 * (`docs/spec_topics/query/query-escapes-stringification.md`, the `number`
 * row).
 */
export function mapNonRepresentableReturnValue(
  value: unknown,
  calleePath: string,
): EnvelopeFailureMapping | undefined {
  const hit = firstNonFiniteNumber(value, 1, "");
  if (hit === undefined) {
    return undefined;
  }
  const location = hit.pointer.length > 0 ? ` at ${hit.pointer}` : "";
  const message = `subagent return value is not JSON-representable${location}: ${String(hit.value)}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "return_validation",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE,
      message,
    },
  };
}
