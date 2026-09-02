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
//   - parent-side three-way stdout-line classification
//     (`classifyChildStdoutLine`: envelope / other-json / unparseable) and its
//     `boolean` wrapper (`lineCarriesReservedKey`), line parsing
//     (`parseEnvelopeLine`), and stray-line-tolerant stream scanning
//     (`scanStreamForEnvelope`);
//   - versioning + skew detection (a version the parent does not recognise is
//     detected, not tolerated);
//   - the ADVISORY (non-fail-closed) `theta/runtime/subagent-wire-parse-failed`
//     diagnostic (`mapWireParseFailure`) for a non-envelope stdout line that did
//     not parse as JSON — the parent still ignores the line for envelope
//     selection (bug 0086 §Fix disposition 1);
//   - the fail-closed mappings for FIVE failure classes. Four each carry their
//     own pinned diagnostic: envelope parse failure, envelope schema skew and
//     child exit WITHOUT an envelope map to `Err(InvokeInfraError { cause:
//     "internal_error" })`; a terminal `Ok` payload carrying a non-finite
//     `number` maps to `Err(InvokeInfraError { cause: "return_validation" })`
//     instead — a DIFFERENT cause, because that payload is refused as
//     unrepresentable on the wire rather than as an internal defect. The
//     fifth — a terminal `Ok` payload whose JSON-document depth exceeds
//     ceiling #4's cap — maps to that SAME `cause: "return_validation"` but
//     carries NO diagnostic: it reuses ceiling #4's own canonical message and
//     `InvokeInfraError` carrier rather than minting a registered code, because
//     no registry row exists for a ceiling-#4 depth breach at any of its five
//     enforcement points (bug 0187 §Fix (b)).
//
// WHY this succeeds the RFC-0005 RPC-drive wire module: under RFC 0006 the
// child owns its whole interpreter and the parent resolves nothing per-query —
// it consumes only this final-value envelope (PIC-59). The parent-side subagent
// contract reduces to envelope consumption.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, #subagent-return-envelope,
// #subagent-error-fidelity, #subagent-cli-wire-pins), invocation.md (INV-5),
// errors-and-results/queryerror-variants.md (the `err` arm mirrors the
// `QueryError` union), schema-subset.md (§"Depth Enforcement" — the
// ceiling-#4 depth cap and its canonical depth-violation message, both reused
// verbatim by the depth refusal below), diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-envelope-parse-failed`,
// `theta/runtime/subagent-envelope-schema-skew`,
// `theta/runtime/subagent-exit-without-envelope`,
// `theta/runtime/subagent-return-value-not-representable`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderHostDerivedTail } from "../diagnostics/placeholder";
import { DEPTH_VIOLATION_MESSAGE, MAX_JSON_DEPTH } from "./depth-walk";
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

/**
 * One value-graph position's declaring-enum tag, carried in the OPTIONAL
 * `enum_tags` envelope sidecar (bug 0342 §Fix, D3 carriage): `p` is the
 * RFC-6901 JSON Pointer to the position within the `ok` payload, `k` is its
 * declaring-enum tag string. Owned here (the wire owner of the envelope
 * shape) and imported TYPE-ONLY by `enum-tag-carriage.ts`, which builds and
 * consumes entries of this shape but never imports anything else from this
 * module — a module this one imports nothing from, so the two do not cycle.
 */
export interface EnumTagEntry {
  readonly p: string;
  readonly k: string;
}

/** The `ok` arm of the envelope payload: the child's final value, whose representability AND depth the caller establishes before this envelope is written (`mapNonRepresentableReturnValue`, `mapTooDeepReturnValue` — both reaching inside a nested `Result`'s wire form, bug 0201 §Fix (a)) rather than assuming either by construction; the writer itself establishes the sign of zero (`stringifyPreservingNegativeZero`, bug 0188 §Fix (a)). The OPTIONAL `enum_tags` sidecar (bug 0342 §Fix) restores each forwarded value's per-position declaring key across the envelope boundary that collapses a boxed enum carrier to its bare wire string; present only when the value carries at least one enum position, so an enum-free return stays byte-identical on the wire. */
export interface EnvelopeOk {
  readonly v: number;
  readonly ok: unknown;
  readonly enum_tags?: readonly EnumTagEntry[];
}

/**
 * The `err` arm's OPTIONAL provenance sidecar (bug 0347 §Fix, a SIBLING of
 * `err` exactly as `enum_tags` is a sibling of `ok`, bug 0342 precedent):
 * `"mint"` marks a child-side boundary mint (stays bare to the invoke
 * parent), `"propagated"` marks a leaf the callee's own body returned —
 * whether raised directly or `?`-propagated from a nested `invoke` (wraps,
 * INV-5 parity with the in-process leg). Absent =
 * today's closed-set `cause` proxy, verbatim, in both skew directions.
 */
export type ErrProvenance = "mint" | "propagated";

/** The `err` arm of the envelope payload: a `QueryError` (the `err` arm mirrors the union), plus the OPTIONAL `err_provenance` sidecar (bug 0347 §Fix). */
export interface EnvelopeErr {
  readonly v: number;
  readonly err: QueryError;
  readonly err_provenance?: ErrProvenance;
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
// Child-side serialisation.
// ---------------------------------------------------------------------------

/**
 * Serialise the child's `Ok` final value as one JSONL envelope line
 * (`{"theta_result":{"v":<version>,"ok":…}}\n`). The caller establishes
 * `value`'s representability AND depth before calling this, at any position
 * — including inside a nested `Result`'s wire form (`classifyWireNode`, bug
 * 0201 §Fix (a)): a payload whose JSON-document depth exceeds ceiling #4's
 * cap is refused (`mapTooDeepReturnValue`), and — within that cap — a
 * payload carrying a non-finite `number` anywhere within it is refused
 * (`mapNonRepresentableReturnValue`). The writer itself establishes leaf
 * fidelity for the sign of zero: `stringifyPreservingNegativeZero` emits the
 * `-0` form the JSON grammar already admits — `JSON.parse` recovers `-0` at
 * the root, at a field and in an array — rather than reaching plain
 * `JSON.stringify`, which renders every `-0` as `0` and cannot be made to do
 * otherwise by any `replacer` or `toJSON` hook (measured): the hole bug 0188
 * §Fix (a) closes is in the writer, not in the wire format.
 */
export function serializeOkEnvelope(value: unknown, enumTags?: readonly EnumTagEntry[]): string {
  const payload: EnvelopeOk = {
    v: THETA_ENVELOPE_VERSION,
    ok: value,
    // Emitted only when non-empty, so an enum-free return's envelope bytes are
    // unchanged (bug 0342 §Fix: additive sidecar, not a widened envelope
    // shape).
    ...(enumTags !== undefined && enumTags.length > 0 ? { enum_tags: enumTags } : {}),
  };
  return `${stringifyPreservingNegativeZero({ [THETA_RESULT_KEY]: payload })}\n`;
}

/**
 * The seed `mintNegativeZeroSentinel` doubles until it is absent from the
 * document it is substituted into — named so a reader of a captured envelope
 * line recognises it as this module's own marker rather than author data.
 */
const NEGATIVE_ZERO_SENTINEL_SEED = "theta_negative_zero_sentinel";

/**
 * Mint a string guaranteed absent from `plain` by doubling
 * `NEGATIVE_ZERO_SENTINEL_SEED` for as long as the candidate still occurs in
 * it. Each iteration doubles the candidate's length, so once it exceeds
 * `plain`'s length the candidate cannot be a substring of `plain`: the loop
 * terminates in at most `O(log n)` iterations (`n` = `plain.length`) and the
 * returned sentinel is provably absent from `plain`, whatever `plain`
 * contains — including author string data that spells the seed itself.
 */
function mintNegativeZeroSentinel(plain: string): string {
  let sentinel = NEGATIVE_ZERO_SENTINEL_SEED;
  while (plain.includes(sentinel)) {
    sentinel += sentinel;
  }
  return sentinel;
}

/**
 * `JSON.stringify`, with `-0` number leaves rendered as `-0` rather than `0`.
 * Two passes:
 *
 * 1. Stringify `document` with an IDENTITY replacer that only RECORDS
 *    whether a `-0` number leaf was seen; the replacer changes no value, so
 *    this pass's bytes are `JSON.stringify`'s own. For every `document`
 *    carrying no `-0`, those bytes are what this function returns — measured
 *    over `tests/subagent-envelope-negative-zero-fidelity.test.ts`'s
 *    `BYTES-IDENTICAL` cell and over every committed envelope-producing
 *    test.
 * 2. Only when a `-0` leaf was seen: re-stringify with a replacer that maps
 *    each `-0` leaf to a sentinel string `mintNegativeZeroSentinel` mints
 *    against pass 1's own bytes, then textually replace each quoted sentinel
 *    token with the bare `-0` token. The sentinel is absent from pass 1's
 *    bytes by construction, so the quoted token in this pass's own output
 *    occurs only where this replacer put it, and the substitution to `-0`
 *    is exact.
 *
 * Detection and rendering both ride `JSON.stringify`'s OWN traversal, so this
 * function walks no payload of its own: CIO-3's prohibition on unbounded
 * recursion in the envelope writer is satisfied with nothing to bound here —
 * unlike `firstNonFiniteNumber` and `wireFormExceedsDepthCap`, which
 * hand-recurse and are each bounded by `MAX_JSON_DEPTH`.
 *
 * That traversal is also why this function's reach INCLUDES a `-0`
 * leaf nested inside a `Result` carrier: the `makeOk` / `makeErr`
 * carrier's `ok` and `value` / `error` fields are own enumerable string
 * keys, which `JSON.stringify` descends. `firstNonFiniteNumber` and
 * `wireFormExceedsDepthCap` descend that same carrier now too, through
 * `classifyWireNode` (bug 0201 §Fix (a)) — but they decide REFUSAL,
 * a different question from the RENDERING this function decides: this
 * function's wider reach changes how a `-0` leaf renders, never which
 * payloads either of those two walks refuses. PIC-59's *Result-carriage
 * bound* (`docs/spec_topics/pi-integration-contract/subagent.md`,
 * `#subagent-envelope-result-carriage-bound`) states what those two walks
 * refuse, not what this function renders.
 */
function stringifyPreservingNegativeZero(document: unknown): string {
  let carriesNegativeZero = false;
  const plain = JSON.stringify(document, (_key: string, member: unknown): unknown => {
    if (typeof member === "number" && Object.is(member, -0)) {
      carriesNegativeZero = true;
    }
    return member;
  });
  if (!carriesNegativeZero) {
    return plain;
  }
  const sentinel = mintNegativeZeroSentinel(plain);
  const encoded = JSON.stringify(document, (_key: string, member: unknown): unknown =>
    typeof member === "number" && Object.is(member, -0) ? sentinel : member,
  );
  return encoded.split(`"${sentinel}"`).join("-0");
}

/**
 * Serialise the child's `Err` value (a `QueryError`) as one JSONL envelope line
 * (`{"theta_result":{"v":<version>,"err":…}}\n`). Every `Err` variant an
 * in-process subagent could surface is representable (PIC-59).
 */
export function serializeErrEnvelope(error: QueryError, provenance?: ErrProvenance): string {
  const payload: EnvelopeErr = {
    v: THETA_ENVELOPE_VERSION,
    err: error,
    // Emitted only when the caller knows the provenance, so an unstamped call
    // (an old call site, or one that has not yet been taught the provenance)
    // stays byte-identical on the wire (bug 0347 §Fix, additive sidecar).
    ...(provenance !== undefined ? { err_provenance: provenance } : {}),
  };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}

// ---------------------------------------------------------------------------
// Parent-side matching + parsing.
// ---------------------------------------------------------------------------

/** The parse verdict for one candidate envelope line (a line carrying the reserved key). */
export type EnvelopeParse =
  | { readonly kind: "ok"; readonly value: unknown; readonly enumTags?: readonly EnumTagEntry[] }
  | { readonly kind: "err"; readonly error: QueryError; readonly provenance?: ErrProvenance }
  | { readonly kind: "schema-skew"; readonly observed: number; readonly required: number }
  | { readonly kind: "parse-failed"; readonly line: string };

/**
 * The three-way classification of one child `--mode json` stdout line: a
 * reserved-key `theta_result` envelope line (`envelope`); a line that parses
 * as JSON but carries no reserved key — a valid non-envelope `--mode json`
 * event the parent correctly ignores (`other-json`); or a line that does not
 * parse as JSON at all, carrying the offending line for the advisory
 * `theta/runtime/subagent-wire-parse-failed` diagnostic (`unparseable`). An
 * empty or whitespace-only line is not parseable JSON either, so it
 * classifies `unparseable` here — whether it is worth diagnosing is a
 * separate, driver-seam question this classifier does not answer (bug 0086
 * §Fix disposition 1).
 *
 * This is the sole `JSON.parse` + reserved-key test for a child stdout line;
 * {@link lineCarriesReservedKey} is a thin `boolean` wrapper over it kept for
 * every existing `boolean` call site.
 */
export type ChildStdoutLineClass =
  | { readonly kind: "envelope" }
  | { readonly kind: "other-json" }
  | { readonly kind: "unparseable"; readonly line: string };

export function classifyChildStdoutLine(line: string): ChildStdoutLineClass {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: stray-line tolerance — pi-integration-contract/subagent.md PIC-59
    void parseError;
    return { kind: "unparseable", line };
  }
  const carriesReservedKey =
    typeof parsed === "object" &&
    parsed !== null &&
    Object.prototype.hasOwnProperty.call(parsed, THETA_RESULT_KEY);
  return carriesReservedKey ? { kind: "envelope" } : { kind: "other-json" };
}

/**
 * Whether one stdout line carries the reserved `theta_result` top-level key.
 * A line that is not JSON, or is JSON but does not carry the reserved key
 * (a valid `--mode json` event, garbage, or partial JSON), returns `false` —
 * the parent ignores it (stray-line tolerance, PIC-59). A thin wrapper over
 * {@link classifyChildStdoutLine}'s three-way verdict, kept `boolean` for its
 * existing call sites rather than widened, since only the reserved-key
 * question — not the class of a non-envelope line — is decided here.
 */
export function lineCarriesReservedKey(line: string): boolean {
  return classifyChildStdoutLine(line).kind === "envelope";
}

/**
 * Validate an untrusted `enum_tags` field against the {@link EnumTagEntry}
 * shape: an array whose every element is an object carrying string `p` and
 * string `k`. Anything else — absent, not an array, or an element missing
 * either field or holding a non-string value — is IGNORED (returns
 * `undefined`), the same posture `parseEnvelopeLine` already takes on an
 * unknown top-level field: the sidecar is additive and version-skew-tolerant
 * (bug 0342 §Fix), so a malformed or absent sidecar never fails the parse and
 * never mints a diagnostic — it only means the caller falls back to the
 * immediate-callee retag it already had before this sidecar existed.
 */
function parseEnumTagsSidecar(candidate: unknown): readonly EnumTagEntry[] | undefined {
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  const entries: EnumTagEntry[] = [];
  for (const element of candidate) {
    if (typeof element !== "object" || element === null) {
      return undefined;
    }
    const record = element as Record<string, unknown>;
    if (!Object.hasOwn(record, "p") || !Object.hasOwn(record, "k")) {
      return undefined;
    }
    const { p, k } = record;
    if (typeof p !== "string" || typeof k !== "string") {
      return undefined;
    }
    entries.push({ p, k });
  }
  return entries;
}

/**
 * Validate an untrusted `err_provenance` field: only the two recognised
 * literal values are honoured; anything else — absent, malformed, wrong type
 * — is IGNORED (returns `undefined`), mirroring {@link parseEnumTagsSidecar}'s
 * ignore-on-malformed posture. The sidecar is additive and skew-tolerant (bug
 * 0347 §Fix): a malformed or absent marker never fails the parse and never
 * mints a diagnostic, it only means the caller falls back to the closed-set
 * `cause` proxy it already had before this sidecar existed.
 */
function parseErrProvenance(candidate: unknown): ErrProvenance | undefined {
  return candidate === "mint" || candidate === "propagated" ? candidate : undefined;
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
    const validTags = parseEnumTagsSidecar(record.enum_tags);
    return { kind: "ok", value: record.ok, ...(validTags !== undefined ? { enumTags: validTags } : {}) };
  }
  if (Object.prototype.hasOwnProperty.call(record, "err")) {
    const provenance = parseErrProvenance(record.err_provenance);
    return { kind: "err", error: record.err as QueryError, ...(provenance !== undefined ? { provenance } : {}) };
  }
  // A reserved-key line carrying neither arm fails the pinned schema.
  return { kind: "parse-failed", line };
}

/**
 * The stream-scan verdict: whether a reserved-key envelope line was found, its
 * parse, and every unparseable line skipped along the way (stream order,
 * excluding valid non-envelope JSON) — so this scanner no longer merges the
 * unparseable class into silence a second time (bug 0086 §Actual behaviour
 * item 5). `scanStreamForEnvelope` has no `src/` caller at HEAD, so it emits
 * no diagnostic of its own; the field exists so a future caller inherits the
 * class separation rather than having to rediscover it.
 */
export type EnvelopeScan =
  | { readonly found: false; readonly unparseableLines: readonly string[] }
  | { readonly found: true; readonly parse: EnvelopeParse; readonly unparseableLines: readonly string[] };

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
  const unparseableLines: string[] = [];
  for (const line of lines) {
    const classified = classifyChildStdoutLine(line);
    if (classified.kind === "envelope") {
      return { found: true, parse: parseEnvelopeLine(line), unparseableLines };
    }
    if (classified.kind === "unparseable") {
      unparseableLines.push(classified.line);
    }
  }
  return { found: false, unparseableLines };
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

// ---------------------------------------------------------------------------
// The shared wire-form node classifier both bounded walks below consult (bug
// 0201 §Fix (a)) — one answer to what a node's wire form looks like, so the
// two walks cannot disagree about a carrier's shape again.
// ---------------------------------------------------------------------------

/**
 * The three shapes a JSON document's nodes take, for {@link classifyWireNode}
 * to sort a value into: `scalar` (nothing beneath it to descend into), `array`,
 * or `record`. {@link firstNonFiniteNumber}, {@link wireFormExceedsDepthCap}
 * and `wireFormDepthWalk` (`./wire-form-depth-walk.ts`) all consult this
 * classification instead of each testing carrier shapes on its own, so the
 * three walks answer the carrier question identically by construction.
 */
export type WireNode =
  | { readonly kind: "scalar" }
  | { readonly kind: "array"; readonly elements: readonly unknown[] }
  | { readonly kind: "record"; readonly entries: readonly (readonly [string, unknown])[] };

/**
 * The one `scalar` node every scalar classifies to. A scalar carries no
 * children, so nothing distinguishes one scalar node from another — sharing
 * this instance rather than allocating `{ kind: "scalar" }` afresh per call
 * makes that provable by reference (`Object.is`) rather than left to
 * structural comparison, and costs one allocation for the module's whole
 * lifetime instead of one per scalar node classified. `Object.freeze` keeps
 * the initializer a call expression rather than a bare object literal, so
 * `tools/arch-checks/no-module-level-mutable.js`'s scan — which flags a
 * module-level `const` only on a directly-observable object/array literal
 * initializer — reads this as the immutable constant it is.
 */
const SCALAR_WIRE_NODE: WireNode = Object.freeze({ kind: "scalar" });

/**
 * Classify `value`'s WIRE FORM — what `JSON.stringify` would write for it,
 * not the interpreter's own carrier representation — as a {@link WireNode}.
 * The one answer {@link firstNonFiniteNumber}, {@link wireFormExceedsDepthCap}
 * and `wireFormDepthWalk` all consult, so a carrier shape is classified once
 * rather than mirrored by hand across the three walks (bug 0201 §Fix (a); bug
 * 0202).
 *
 * A boxed `String` — the enum carrier `makeEnumValue` builds
 * (`src/runtime/value.ts:135`) — classifies `scalar`: its wire form is the
 * primitive string it holds, not its own enumerable character-index keys
 * (`Object.keys(new String("red"))` is `["0","1","2"]`). This is the
 * deliberate divergence from `depth-walk.ts`'s `depthWalk`, which counts
 * those indices as children and would refuse `[[[[Colour.Red]]]]` — whose
 * document `[[[["red"]]]]` is depth 5 — with a message false of it;
 * `depthWalk` answers only for already-parsed JSON, where a boxed `String`
 * cannot occur, so the divergence costs it nothing anywhere (bug 0202), and
 * it is why this classification lives here rather than in `depth-walk.ts`.
 *
 * A `Result` classifies `record`, through the same branch a plain object
 * takes: `RESULT_TAG` (`src/runtime/value.ts:88`) is installed
 * non-enumerable, so `Object.entries` — like `JSON.stringify` — never visits
 * it, and only the carrier's own enumerable `ok` / `value` / `error` string
 * keys are seen. A `Result` is not a case this function tests for on its
 * own: once the brand is excluded its wire form IS a plain record's wire
 * form, so a dedicated `Result` arm would answer a question the record
 * branch below already answers for it — dead code by construction, which is
 * why none exists.
 */
export function classifyWireNode(value: unknown): WireNode {
  if (value instanceof String) {
    return SCALAR_WIRE_NODE;
  }
  if (Array.isArray(value)) {
    return { kind: "array", elements: value };
  }
  if (typeof value !== "object" || value === null) {
    return SCALAR_WIRE_NODE;
  }
  return { kind: "record", entries: Object.entries(value as Record<string, unknown>) };
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
 * The leaf test is finiteness (`Number.isFinite`), not sign — a `-0` leaf
 * passes it, deliberately rather than by oversight. Bug 0188 route (a) closes
 * the sign-of-zero defect by preserving a `-0` leaf's sign at the writer
 * (`stringifyPreservingNegativeZero`) instead of widening this predicate to
 * refuse it, which would newly refuse a today-passing input with no
 * registered class behind it
 * (`docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md`
 * §Fix (e)(6)).
 *
 * Bounded by `MAX_JSON_DEPTH`, because unbounded recursion inside the envelope
 * writer is forbidden (CIO-3). The bound costs nothing at any subagent return
 * boundary: past the cap nothing a payload carries crosses the envelope at
 * all, because `mapTooDeepReturnValue` (this module) runs one sub-check
 * earlier, in `driveSubagentRootRegime`'s `terminal.ok` arm
 * (`src/extension/production-theta-producer.ts`), and refuses the whole
 * payload before this search is ever reached — so descending further here
 * could only re-decide a value that seam already refused (bug 0187 §Fix (b)).
 * That holds whether or not the payload nests a `Result`:
 * {@link wireFormExceedsDepthCap} measures a carrier's contribution to the
 * document's depth exactly as this search measures its non-finite content
 * (bug 0201 §Fix (a)).
 *
 * Every node's wire form is classified by {@link classifyWireNode} rather
 * than tested here. A boxed `String` (the `makeEnumValue` enum carrier)
 * classifies `scalar` and is not descended, since it holds no `number`. A
 * `Result` classifies `record` — the brand is a non-enumerable symbol
 * (`src/runtime/value.ts:88`), so `Object.entries` never visits it, and only
 * the carrier's own enumerable `ok` / `value` / `error` fields are seen — so a
 * non-finite `number` reachable only through a nested `Result` IS found here,
 * at the position the descent accumulates through that carrier's own field
 * name: `[Ok(1 / 0), 1]` refuses at `/0/value` rather than crossing as the
 * `null` `serializeOkEnvelope` would otherwise substitute for it. The pointer
 * names the RFC-6901 position in the JSON document the envelope would have
 * carried — true of every position this search names, carrier or not — and
 * because the `value` / `error` token is derived from the encoding the
 * descent actually walks rather than spelled by hand, it tracks the
 * reference encoding (`docs/spec_topics/runtime-value-model.md:16`)
 * automatically if that encoding ever changes. Descends by `Object.entries`
 * only — own enumerable string keys — so an interpreter-private brand symbol
 * is never visited.
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
  const node = classifyWireNode(value);
  if (node.kind === "array") {
    for (let index = 0; index < node.elements.length; index++) {
      const hit = firstNonFiniteNumber(node.elements[index], level + 1, `${pointer}/${index}`);
      if (hit !== undefined) {
        return hit;
      }
    }
    return undefined;
  }
  if (node.kind === "record") {
    for (const [key, member] of node.entries) {
      const hit = firstNonFiniteNumber(member, level + 1, `${pointer}/${escapePointerToken(key)}`);
      if (hit !== undefined) {
        return hit;
      }
    }
    return undefined;
  }
  return undefined;
}

/**
 * Whether the JSON DOCUMENT `value` serialises to nests deeper than ceiling
 * #4's cap — the `MAX_JSON_DEPTH` counting algorithm
 * (`docs/spec_topics/schema-subset.md` §"Depth Enforcement", *Counting
 * algorithm*: the root sits at level 1, a non-empty object or array adds one
 * level, a scalar or empty container adds none) evaluated over the payload's
 * WIRE FORM.
 *
 * WHY this is not `depthWalk` (`src/runtime/depth-walk.ts`) itself: that walk
 * answers a question about ALREADY-PARSED JSON, and this module runs on the
 * interpreter's own value on its way to `JSON.stringify`. Those two differ on
 * exactly one shape — the enum carrier `makeEnumValue` (`src/runtime/value.ts`)
 * builds is a boxed `String`, whose own enumerable keys are its character
 * indices (`Object.keys(new String("red"))` is `["0","1","2"]`), so
 * `depthWalk` reads it as a non-empty object and counts a level for it, while
 * `JSON.stringify` renders it as the bare scalar string it holds. Sharing
 * `depthWalk` here would therefore refuse a payload whose JSON document is
 * WITHIN the cap: `[[[[Colour.Red]]]]` serialises to `[[[["red"]]]]`, document
 * depth 5, and a refusal naming depth would be false of it. The carrier arm
 * stays here rather than in `depth-walk.ts`, which answers only for the
 * parsed-JSON sites, where a boxed `String` cannot occur; the three theta-value
 * sites consult `wireFormDepthWalk`, which consults this same classifier.
 *
 * Bounded by construction, so CIO-3's prohibition on unbounded recursion in the
 * envelope writer (bug 0187 §Fix (e)(3)) is satisfied without a cap-raising
 * change anywhere: the first statement fast-fails the moment a node's level
 * would exceed `MAX_JSON_DEPTH`, exactly as `depthWalk`'s own descent does, so
 * no input can drive this walk past the cap.
 *
 * Both bounded walks in this module consult the same {@link classifyWireNode}
 * rather than each mirroring hand-written carrier arms (bug 0201 §Fix (a)), so
 * they cannot answer the carrier question differently again:
 *
 *   - a boxed `String` classifies `scalar` and is never descended;
 *   - a `Result` classifies `record` — the brand is a non-enumerable symbol
 *     (`src/runtime/value.ts:88`), so `Object.entries` never visits it, and
 *     only the carrier's own enumerable `ok` / `value` / `error` fields are
 *     seen — so a `Result`'s contribution to the document's depth is counted
 *     exactly as `JSON.stringify`'s own document has it. Measured:
 *     `[Ok([[[[[1]]]]]), 1]` writes `[{"ok":true,"value":[[[[[1]]]]]},1]`,
 *     document depth 8, and this walk now answers `true` for it, so
 *     {@link mapTooDeepReturnValue} refuses it. A `Result` at a position that
 *     already exceeds the cap was refused before this walk ever reaches it —
 *     the level check above precedes every classifier consult — and stays
 *     refused for the same reason;
 *   - records by own enumerable string keys only (the classifier's `record`
 *     branch), arrays by element (its `array` branch), so an
 *     interpreter-private brand symbol is never visited and this walk agrees
 *     with `JSON.stringify` on every shape the envelope IS specified to
 *     carry, a `Result` included.
 */
function wireFormExceedsDepthCap(value: unknown, level: number): boolean {
  if (level > MAX_JSON_DEPTH) {
    return true;
  }
  const node = classifyWireNode(value);
  if (node.kind === "array") {
    for (const element of node.elements) {
      if (wireFormExceedsDepthCap(element, level + 1)) {
        return true;
      }
    }
    return false;
  }
  if (node.kind === "record") {
    for (const [, member] of node.entries) {
      if (wireFormExceedsDepthCap(member, level + 1)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * Map a terminal `Ok` payload whose JSON-document depth exceeds ceiling #4's
 * cap to `Err(InvokeInfraError { cause: "return_validation" })`, run BEFORE
 * {@link mapNonRepresentableReturnValue} (and before `serializeOkEnvelope`)
 * in the writer's `terminal.ok` arm — bug 0187 §Fix (b). PIC-59's fail-closed
 * discipline reaches every depth only if the writer refuses a `>cap` payload
 * ahead of serialising it; {@link wireFormExceedsDepthCap} fast-fails at the
 * first node whose level would exceed the cap, so the work this seam does is
 * bounded by construction — CIO-3's prohibition on unbounded recursion in the
 * envelope writer is satisfied without widening
 * {@link firstNonFiniteNumber}'s own bounded search (bug 0187 §Fix (e)(3)).
 * The verdict is a function of the payload's WIRE FORM rather than of the
 * interpreter's carrier representation, which is why that walk is
 * module-private rather than the shipped `depthWalk` — see its own comment.
 *
 * BOUND, as shipped and as PIC-59 now states it (that page's
 * *Result-carriage bound*, `#subagent-envelope-result-carriage-bound`):
 * {@link wireFormExceedsDepthCap} descends a `Result`'s wire form as an
 * ordinary record (bug 0201 §Fix (a)), so depth contributed only from INSIDE
 * a nested `Result` is counted exactly as `JSON.stringify`'s own document has
 * it. Measured: `[Ok([[[[[1]]]]]), 1]` serialises to
 * `[{"ok":true,"value":[[[[[1]]]]]},1]` at document depth 8, and this function
 * now refuses it with the canonical message below. A `Result` at a position
 * that already exceeds the cap is refused there, because the level check
 * precedes every classifier consult; the disposition
 * is pinned in both directions by
 * `tests/subagent-return-depth-refusal.test.ts`'s
 * `CONTROL (FENCE-NESTED-RESULT)` cell, re-pinned under bug 0201's authority.
 *
 * `MAX_JSON_DEPTH` and the message are ceiling #4's own pinned canonical
 * values, imported from `src/runtime/depth-walk.ts`
 * (`docs/spec_topics/schema-subset.md` §"Error shape") rather than restated as
 * literals, and `cause` is the one the ceiling-#4 `invoke<T>`-return row
 * already carries
 * (`docs/spec_topics/hard-ceilings/ceilings-3-and-4.md#ceiling-4-table`) — so
 * no `InvokeInfraCause` member and no registry row is added for this refusal.
 * No `schema_keyword` is carried: `InvokeInfraError` has no such field, which
 * matches the typed `invoke<T>`-return boundary exactly — there
 * `#validateInvokeReturn` returns `depthBreach.result` and discards
 * `depthBreach.issue`, so the caller-visible carrier likewise carries the
 * message alone.
 *
 * The envelope writer validates nothing and compiles no schema, so this is a
 * NEW PIC-59 fail-closed class, not a sixth row of ceiling #4's per-boundary
 * table (`docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`
 * §"Five-site list co-edit obligation" keys that obligation to rows of the AJV
 * enforcement-point table, and this seam is not one of its boundaries).
 * Returns `InvokeInfraError` directly rather than {@link EnvelopeFailureMapping}:
 * there is no diagnostic to pair it with — no registry row exists for a
 * ceiling-#4 depth breach at any of its five enforcement points, and PIC-59's
 * *Marked-root registration refusal* is the shipped precedent for a
 * child-side fail-closed class that mints no code. `undefined` when the
 * payload sits within the cap, in which case
 * {@link mapNonRepresentableReturnValue} runs next.
 */
export function mapTooDeepReturnValue(
  value: unknown,
  calleePath: string,
): InvokeInfraError | undefined {
  if (!wireFormExceedsDepthCap(value, 1)) {
    return undefined;
  }
  return {
    kind: "invoke_infra",
    message: DEPTH_VIOLATION_MESSAGE,
    callee_path: calleePath,
    cause: "return_validation",
  };
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
