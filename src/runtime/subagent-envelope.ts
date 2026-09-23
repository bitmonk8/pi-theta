// RFC-0006 — subagent return-value envelope (PIC-59) seam.
//
// The child theta emits a single machine-readable envelope as ONE JSONL line
// with the reserved top-level key `theta_result` on stdout, alongside the
// `--mode json` event stream; the parent matches the reserved key and ignores
// every other line. This module owns the schema, serialisation and parsing,
// and re-exports failure mappings and wire-form validation from sibling modules:
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

import type { QueryError } from "./query-error";

export * from "./subagent-envelope-failures";
export * from "./subagent-wire-form";

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
  readonly fn_tail?: FnTail;
}

/**
 * RFC 0012 §10 — the OPTIONAL `fn_tail` sidecar a `subagent fn` child stamps
 * when the fn body's FINAL VALUE was itself a `Result` (a sibling of `ok` /
 * `err`, the `enum_tags` / `err_provenance` precedent). FN-6 fixes the call's
 * value as the body's final value, bare: a `"done"` tail is the string,
 * an `Ok(x)` tail is the `Result` `Ok(x)`, an `Err(e)` tail is the `Result`
 * `Err(e)` un-wrapped — while a `?`-propagated `Err` crosses wrapped in
 * `InvokeCalleeError`. The envelope's `ok` / `err` arms alone cannot tell an
 * `Ok(x)` tail from a bare `x` tail, nor an `Err(e)` tail from a
 * `?`-propagated `e`, so the child names the tail's constructor here and the
 * parent rebuilds the `Result` the in-process drive used to return. Absent
 * on a bare tail and on every `.theta` callee envelope (whose FN-5 projection
 * conflates the two by design); ignored when malformed (skew-tolerant).
 */
export type FnTail = "ok" | "err";

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
  readonly fn_tail?: FnTail;
}

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
export function serializeOkEnvelope(
  value: unknown,
  enumTags?: readonly EnumTagEntry[],
  fnTail?: FnTail,
): string {
  const payload: EnvelopeOk = {
    v: THETA_ENVELOPE_VERSION,
    ok: value,
    // Emitted only when non-empty, so an enum-free return's envelope bytes are
    // unchanged (bug 0342 §Fix: additive sidecar, not a widened envelope
    // shape).
    ...(enumTags !== undefined && enumTags.length > 0 ? { enum_tags: enumTags } : {}),
    // RFC 0012 §10: a `subagent fn` child's `Ok(x)` tail; absent otherwise.
    ...(fnTail !== undefined ? { fn_tail: fnTail } : {}),
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
export function serializeErrEnvelope(
  error: QueryError,
  provenance?: ErrProvenance,
  fnTail?: FnTail,
): string {
  const payload: EnvelopeErr = {
    v: THETA_ENVELOPE_VERSION,
    err: error,
    // Emitted only when the caller knows the provenance, so an unstamped call
    // (an old call site, or one that has not yet been taught the provenance)
    // stays byte-identical on the wire (bug 0347 §Fix, additive sidecar).
    ...(provenance !== undefined ? { err_provenance: provenance } : {}),
    // RFC 0012 §10: a `subagent fn` child's `Err(e)` tail; absent otherwise.
    ...(fnTail !== undefined ? { fn_tail: fnTail } : {}),
  };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}

// ---------------------------------------------------------------------------
// Parent-side matching + parsing.
// ---------------------------------------------------------------------------

/** The parse verdict for one candidate envelope line (a line carrying the reserved key). */
export type EnvelopeParse =
  | {
      readonly kind: "ok";
      readonly value: unknown;
      readonly enumTags?: readonly EnumTagEntry[];
      readonly fnTail?: FnTail;
    }
  | {
      readonly kind: "err";
      readonly error: QueryError;
      readonly provenance?: ErrProvenance;
      readonly fnTail?: FnTail;
    }
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

/** Validate an untrusted `fn_tail` field (RFC 0012 §10): the two literals, else ignored. */
function parseFnTail(candidate: unknown): FnTail | undefined {
  return candidate === "ok" || candidate === "err" ? candidate : undefined;
}

/**
 * Compile-time schema tether between the child-side writers and the
 * parent-side reader (the `HANDLED_PROGRESS_FIELDS` / result-frames
 * precedent): every field of each envelope arm, keyed by arm, named once.
 * `satisfies` fails `tsc` in THIS file the moment `EnvelopeOk` /
 * `EnvelopeErr` grows a field that is not named here — forcing the writers
 * (`serializeOkEnvelope` / `serializeErrEnvelope`) and the reader
 * (`parseEnvelopeLine` with its sidecar validators) to be updated in the
 * same change, since the reader consumes an untyped
 * `Record<string, unknown>` the compiler cannot tether directly. Pins the
 * SET of fields only; each field's own validation is unchanged below.
 */
const HANDLED_ENVELOPE_FIELDS = {
  ok: { v: true, ok: true, enum_tags: true, fn_tail: true },
  err: { v: true, err: true, err_provenance: true, fn_tail: true },
} satisfies {
  readonly ok: Record<keyof EnvelopeOk, true>;
  readonly err: Record<keyof EnvelopeErr, true>;
};

/**
 * Parse one reserved-key envelope line against the pinned schema. A version the
 * parent does not recognise yields `schema-skew` (detected, not tolerated); a
 * reserved-key line that does not parse against the pinned schema yields
 * `parse-failed`; otherwise the `ok` / `err` arm. The field set each arm
 * carries is pinned by {@link HANDLED_ENVELOPE_FIELDS} above.
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
  const fnTail = parseFnTail(record.fn_tail);
  if (Object.prototype.hasOwnProperty.call(record, "ok")) {
    const validTags = parseEnumTagsSidecar(record.enum_tags);
    return {
      kind: "ok",
      value: record.ok,
      ...(validTags !== undefined ? { enumTags: validTags } : {}),
      ...(fnTail !== undefined ? { fnTail } : {}),
    };
  }
  if (Object.prototype.hasOwnProperty.call(record, "err")) {
    const provenance = parseErrProvenance(record.err_provenance);
    return {
      kind: "err",
      error: record.err as QueryError,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(fnTail !== undefined ? { fnTail } : {}),
    };
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
