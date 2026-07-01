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
import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { CommittedSideEffect } from "./no-rollback";
import type { CodeToolError } from "./query-error";
import { makeErr, type ResultValue } from "./value";

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

const V14G_STUB_TEXT = "\u0000V14g-execute-lowering-unimplemented";

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
 * V14g-T stubs this to a sentinel constant so the filter/join and non-text-
 * discard assertions red on their own value.
 */
export function filterJoinToolText(
  _content: readonly ToolContentBlock[],
): string {
  return V14G_STUB_TEXT;
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
 * V14g-T stubs this to an inert `Err` so the accepted-path `Ok` assertions red
 * on `.ok`.
 */
export function lowerResolvedToolEnvelope(
  _envelope: AgentToolResultEnvelope,
  _sink: ToolLoweringSink,
): ResultValue {
  return makeErr(V14G_STUB_TEXT);
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
 * V14g-T stubs this to an inert sentinel (independent of its input) so every
 * byte-length / value assertion — including the at-or-under-limit no-op case —
 * reds on its own primary expectation.
 */
export function truncateUtf8CodePointBoundary(
  _s: string,
  _maxBytes: number,
): string {
  return V14G_STUB_TEXT;
}

/**
 * Lower an `execute()` throw to `CodeToolError { kind: "code_tool", cause:
 * "execution", message: <m>, tool_name }` where `<m>` is the thrown value coerced
 * to the underlying-error string (placeholder-rendering-b.md §underlying-error
 * coercion) and truncated under the `CODE_TOOL_MESSAGE_MAX_BYTES` code-point-
 * boundary rule (host-interfaces-core.md §"Tool execution from loom code").
 *
 * V14g-T stubs this to a sentinel-`message` carrier so the coercion / truncation
 * assertions red on `.message`.
 */
export function lowerToolExecuteThrow(
  _thrown: unknown,
  toolName: string,
): CodeToolError {
  return {
    kind: "code_tool",
    message: V14G_STUB_TEXT,
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
 * V14g-T stubs this inert: it fires no checkpoint and dispatches nothing,
 * returning a cancelled outcome with no committed effects, so the checkpoint-
 * presence, abort-skip, and ERR-13 assertions red on their own primary
 * expectations.
 */
export async function runCodeSideToolCall(
  _checkpoint: Checkpoint,
  _signal: AbortSignal,
  _site: CheckpointSite,
  _call: CodeSideToolCall,
  _sink: ToolLoweringSink,
): Promise<ToolCallExecOutcome> {
  return { kind: "cancelled", committed: [] };
}
