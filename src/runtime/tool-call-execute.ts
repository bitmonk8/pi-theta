// V14g / V14g-T — code-side `execute()` envelope-lowering on the live runtime
// surface, the tool-call cancellation checkpoint (cka-47, V14g facet), and the
// ERR-13 completed-callee-finality live carrier.
//
// This module owns the runtime side of the accepted-path `execute()` lowering
// mechanics the paired `V14g` implementation leaf fills in (host-interfaces-
// core.md §"Tool execution from loom code", post-F-1578 AgentToolResult shape;
// cancellation.md §Granularity):
//
//   - `filterJoinToolText` — filter a resolved `AgentToolResult.content` array to
//     its `type === "text"` entries and join their `.text` values with a single
//     `"\n"` (no separator before the first or after the last block). Non-text
//     blocks (images, resource references) are discarded silently.
//   - `lowerResolvedToolEnvelope` — lower a cleanly-resolving `AgentToolResult`
//     to `Ok(<filtered/joined text>)` (possibly `Ok("")` for `content: []` or a
//     content array with no surviving text blocks). The discard of non-text
//     blocks emits NO `RuntimeEvent`, `loom-system-note`, or diagnostic — the
//     `ToolLoweringSink` passed in is never touched on the discard path.
//   - `truncateUtf8CodePointBoundary` — UTF-8-encode and truncate a string to at
//     most `maxBytes` bytes on a Unicode code-point boundary: a code point that
//     would straddle the limit is dropped entirely (result MAY be up to three
//     bytes short).
//   - `lowerToolExecuteThrow` — lower an `execute()` throw to
//     `CodeToolError { cause: "execution", message: <m>, tool_name, ... }` where
//     `<m>` is the thrown value coerced to the underlying-error string
//     (placeholder-rendering-b.md §underlying-error coercion) and truncated under
//     the 4096-byte code-point-boundary rule above.
//   - `runCodeSideToolCall` — the live execution surface: fire
//     `checkpoint.before("tool-call", site)` immediately before each code-side
//     `<name>(args)` dispatch (cka-47, V14g facet), read `signal.aborted`, then
//     dispatch and lower the outcome. The completed callee's committed side
//     effects are exposed on the outcome so the ERR-13 completed-callee-finality
//     witness (a downstream `?` / panic / cancel leaves them in place with no
//     compensating turn) is `npm test`-assertable off this surface.
//
// The non-conforming-shape (`loom/runtime/internal-error`, `details.kind =
// "tool-return-shape"`) and non-settling-Promise dispositions routed *off*
// `CodeToolError` are owned by `V14c`, not this leaf. Per host-interfaces-
// core.md (F-1578, "re-anchor execute() outcome routing on AgentToolResult (no
// isError); collapse dead Err branch") the code-side `AgentToolResult` type
// carries NO `isError` field and a cleanly-resolving envelope always lowers to
// `Ok`; the only `CodeToolError { cause: "execution" }` code-side path is the
// `execute()` throw.
//
// V14g-T (tests-task) declares this surface and stubs every behaviour-bearing
// function inertly:
//   - `filterJoinToolText` returns a sentinel constant (so the filter/join and
//     non-text-discard assertions red on their own value),
//   - `lowerResolvedToolEnvelope` returns an inert `Err` (so the accepted-path
//     `Ok(string)` / `Ok("")` assertions red on `.ok`),
//   - `truncateUtf8CodePointBoundary` returns its input unchanged (so the
//     4096-byte code-point-boundary assertions red on the resulting byte length),
//   - `lowerToolExecuteThrow` returns a sentinel-`message` carrier (so the
//     coercion / truncation assertions red on `.message`),
//   - `runCodeSideToolCall` fires no checkpoint and dispatches nothing (so the
//     tool-call-checkpoint presence, abort-skip, and ERR-13 assertions red).
// Each paired V14g-T test reds on its own primary assertion, not on a compile
// error, a missing fixture, or a harness throw. The paired V14g implementation
// leaf fills these in.
//
// Spec: pi-integration-contract/host-interfaces-core.md §"Tool execution from
// loom code"; cancellation.md §Granularity; errors-and-results/
// queryerror-variants.md (§"Code-side tool-call variant");
// errors-and-results/error-model.md §"No rollback" (ERR-13).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { CommittedSideEffect } from "./no-rollback";
import type { CodeToolError } from "./query-error";
import { makeErr, makeOk, type LoomValue, type ResultValue } from "./value";

// --------------------------------------------------------------------------
// AgentToolResult content-block shape (loom-load-bearing subset)
// --------------------------------------------------------------------------

/** A `type: "text"` content block — the only block loom lowers to output. */
export interface ToolTextBlock {
  readonly type: "text";
  readonly text: string;
}

/** Any non-text content block (image, resource reference, …), discarded. */
export interface ToolNonTextBlock {
  readonly type: string;
  readonly [key: string]: unknown;
}

export type ToolContentBlock = ToolTextBlock | ToolNonTextBlock;

/**
 * The code-side `execute()` return type at the loom 1.0 Pi-SDK pin —
 * `AgentToolResult = { content, details, terminate? }` (host-interfaces-core.md
 * §"Tool execution from loom code"). loom reads only `content`; the type carries
 * NO `isError` field (F-1578). `details` / `terminate?` are opaque here.
 */
export interface AgentToolResultEnvelope {
  readonly content: readonly ToolContentBlock[];
}

// --------------------------------------------------------------------------
// Discard-path side-channel sink (must stay untouched on non-text discard)
// --------------------------------------------------------------------------

/**
 * The runtime's normative side channels the accepted-path lowering could reach.
 * Non-text-block discard is NOT a `QueryError` and is not in the always-log
 * set: the lowering MUST NOT call ANY of these on the discard path
 * (host-interfaces-core.md §"Tool execution from loom code"). Passed in so a
 * test can witness that a compliant lowering never touches it.
 */
export interface ToolLoweringSink {
  runtimeEvent(event: RuntimeEvent): void;
  diagnostic(diag: Diagnostic): void;
  systemNote(message: string): void;
}

/** The 4096-byte cap on a `CodeToolError { cause: "execution" }` message. */
export const CODE_TOOL_MESSAGE_MAX_BYTES = 4096;

// --------------------------------------------------------------------------
// (1) content filter/join
// --------------------------------------------------------------------------

/**
 * Filter `content` to its `type === "text"` entries and join their `.text`
 * values with a single `"\n"` (no separator before the first or after the last
 * block). Non-text blocks are discarded. Returns `""` when `content` is empty or
 * no text block survives (host-interfaces-core.md §"Tool execution from loom
 * code").
 *
 */
export function filterJoinToolText(
  content: readonly ToolContentBlock[],
): string {
  // Keep only `type === "text"` blocks; join their `.text` with a single "\n"
  // (Array.join places exactly one separator between adjacent entries and none
  // before the first or after the last). Empty text blocks survive the filter
  // as empty segments — the join is over surviving text entries, not a filter of
  // empty strings, so `[text(""), text("x")]` joins to "\nx".
  return content
    .filter((block): block is ToolTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// --------------------------------------------------------------------------
// (2) accepted-path lowering — Ok(<filtered/joined text>) (possibly Ok(""))
// --------------------------------------------------------------------------

/**
 * Lower a cleanly-resolving `AgentToolResult` to `Ok(<filtered/joined text>)`.
 * An empty result — `content: []` or a content array with no surviving text
 * blocks — is the legal `Ok("")` value. The non-text discard emits nothing on
 * `sink` (host-interfaces-core.md §"Tool execution from loom code").
 *
 */
export function lowerResolvedToolEnvelope(
  envelope: AgentToolResultEnvelope,
  _sink: ToolLoweringSink,
): ResultValue {
  // The non-text discard is not a `QueryError` and is not in the always-log set:
  // `_sink` is deliberately never touched here. An empty result — `content: []`
  // or a content array with no surviving text blocks — lowers to the legal
  // `Ok("")` value the joined text already yields.
  return makeOk(filterJoinToolText(envelope.content));
}

// --------------------------------------------------------------------------
// (5) 4096-byte code-point-boundary truncation + execute()-throw lowering
// --------------------------------------------------------------------------

/**
 * UTF-8-encode `s` and truncate to at most `maxBytes` bytes on a Unicode
 * code-point boundary: every code point in the output is represented by all of
 * its UTF-8 bytes, and no bytes of a partial code point appear. A code point that
 * would straddle the limit is dropped entirely, so the result MAY be up to three
 * bytes shorter than `maxBytes` (host-interfaces-core.md §"Tool execution from
 * loom code").
 *
 */
export function truncateUtf8CodePointBoundary(
  s: string,
  maxBytes: number,
): string {
  const encoder = new TextEncoder();
  if (encoder.encode(s).length <= maxBytes) {
    return s;
  }
  // Accumulate whole code points (iterating `s` yields code points, never lone
  // surrogate halves) until the next one would straddle `maxBytes`; that code
  // point is dropped entirely, so the result is a whole number of code points
  // and MAY be up to three bytes short.
  let byteCount = 0;
  let out = "";
  for (const codePoint of s) {
    const cpBytes = encoder.encode(codePoint).length;
    if (byteCount + cpBytes > maxBytes) {
      break;
    }
    byteCount += cpBytes;
    out += codePoint;
  }
  return out;
}

/**
 * Lower an `execute()` throw to `CodeToolError { kind: "code_tool", cause:
 * "execution", message: <m>, tool_name }` where `<m>` is the thrown value coerced
 * to the underlying-error string (placeholder-rendering-b.md §underlying-error
 * coercion) and truncated under the `CODE_TOOL_MESSAGE_MAX_BYTES` code-point-
 * boundary rule (host-interfaces-core.md §"Tool execution from loom code").
 *
 */
export function lowerToolExecuteThrow(
  thrown: unknown,
  toolName: string,
): CodeToolError {
  const coerced = coerceUnderlyingString(thrown);
  return {
    kind: "code_tool",
    message: truncateUtf8CodePointBoundary(coerced, CODE_TOOL_MESSAGE_MAX_BYTES),
    tool_name: toolName,
    cause: "execution",
  };
}

// --------------------------------------------------------------------------
// Live execution surface — checkpoint (cka-47, V14g) + lowering + ERR-13 carrier
// --------------------------------------------------------------------------

/**
 * A single code-side `<name>(args)` tool call, as driven on the live surface.
 * `dispatch` invokes the Pi tool's `execute()` (resolving an
 * `AgentToolResultEnvelope` or throwing); `committed` are the side effects the
 * callee commits once driven to completion — the ERR-13 completed-callee-
 * finality carrier.
 */
export interface CodeSideToolCall {
  readonly toolName: string;
  dispatch(): Promise<AgentToolResultEnvelope>;
  readonly committed: readonly CommittedSideEffect[];
}

/**
 * The outcome of driving one code-side tool call on the live surface:
 *   - `value` — the call resolved cleanly; `result` is `Ok(<joined text>)`;
 *   - `execution-error` — `execute()` threw; `result` is `Err(CodeToolError)`
 *     and `error` is that carrier;
 *   - `cancelled` — the pre-dispatch checkpoint observed the abort; the call was
 *     never dispatched.
 * `committed` exposes the side effects the completed callee produced (empty on
 * the cancelled path) so the ERR-13 witness can assert they remain final.
 */
export type ToolCallExecOutcome =
  | {
      readonly kind: "value";
      readonly result: ResultValue;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      readonly kind: "execution-error";
      readonly result: ResultValue;
      readonly error: CodeToolError;
      readonly committed: readonly CommittedSideEffect[];
    }
  | { readonly kind: "cancelled"; readonly committed: readonly CommittedSideEffect[] };

/**
 * Drive one code-side `<name>(args)` tool call on the live surface. Await
 * `checkpoint.before("tool-call", site)` immediately before the dispatch
 * (cka-47, V14g facet; cancellation.md §Granularity), read `signal.aborted`, and
 * skip the dispatch when it has fired. Otherwise dispatch `call.dispatch()` and
 * lower the outcome: a clean resolution to `Ok(<joined text>)`, an `execute()`
 * throw to `Err(CodeToolError { cause: "execution", ... })`. The completed
 * callee's `committed` side effects are surfaced on the outcome and remain final
 * under any downstream terminal event (ERR-13; the runtime holds no compensating
 * path — see `handleNoRollbackTerminalEvent`).
 *
 */
export async function runCodeSideToolCall(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  site: CheckpointSite,
  call: CodeSideToolCall,
  sink: ToolLoweringSink,
): Promise<ToolCallExecOutcome> {
  // cka-47 (V14g facet): a cancellation checkpoint fires immediately before the
  // dispatch, carrying the call site (cancellation.md §Granularity; V8a
  // Checkpoint seam PIC-10). The signal read follows the checkpoint.
  await checkpoint.before("tool-call", site);
  if (signal.aborted) {
    // The abort was observed at the pre-dispatch checkpoint: the tool is never
    // dispatched and no side effect is committed.
    return { kind: "cancelled", committed: [] };
  }

  let envelope: AgentToolResultEnvelope;
  try {
    envelope = await call.dispatch();
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    // `call.dispatch()` invokes the Pi tool's `execute(...)`, which signals
    // failure by throwing an arbitrary value owned by the Pi SDK whose runtime
    // shape loom cannot statically guarantee. The throw lowers to
    // `CodeToolError { cause: "execution" }` (host-interfaces-core.md §"Tool
    // execution from loom code"); the completed callee's committed side effects
    // remain final per ERR-13.
    const error = lowerToolExecuteThrow(thrown, call.toolName);
    return {
      kind: "execution-error",
      result: makeErr(error as unknown as LoomValue),
      error,
      committed: call.committed,
    };
  }

  // Clean resolution: lower the envelope to `Ok(<filtered/joined text>)`
  // (possibly `Ok("")`). The completed callee's committed side effects ride on
  // the outcome so the ERR-13 completed-callee-finality witness stays
  // assertable off this surface.
  return {
    kind: "value",
    result: lowerResolvedToolEnvelope(envelope, sink),
    committed: call.committed,
  };
}
