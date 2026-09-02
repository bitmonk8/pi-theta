// V14g / V14g-T — code-side `execute()` envelope-lowering on the live runtime
// surface, the tool-call cancellation checkpoint (cka-47, V14g facet), and the
// ERR-13 completed-callee-finality live carrier.
//
// This module owns the runtime side of the accepted-path `execute()` lowering
// mechanics the paired `V14g` implementation leaf fills in (host-interfaces-
// core.md §"Tool execution from theta code", post-F-1578 AgentToolResult shape;
// cancellation.md §Granularity):
//
//   - `filterJoinToolText` — filter a resolved `AgentToolResult.content` array to
//     its `type === "text"` entries and join their `.text` values with a single
//     `"\n"` (no separator before the first or after the last block). Non-text
//     blocks (images, resource references) are discarded silently.
//   - `lowerResolvedToolEnvelope` — lower a cleanly-resolving `AgentToolResult`
//     to `Ok(<filtered/joined text>)` (possibly `Ok("")` for `content: []` or a
//     content array with no surviving text blocks). The discard of non-text
//     blocks emits NO `RuntimeEvent`, `theta-system-note`, or diagnostic — the
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
// The non-conforming-shape (`theta/runtime/internal-error`, `details.kind =
// "tool-return-shape"`) and non-settling-Promise dispositions routed *off*
// `CodeToolError` are OWNED by `V14c` (`tool-call-off-surface.ts`) — the shape
// vocabulary, the diagnostic construction, and the abort-race live there — and
// this leaf INVOKES that owned routing at the live execution seam:
// `runCodeSideToolCall` races the `execute()` Promise against the abort signal
// via `awaitToolSettlementOrAbort` (NOCEIL-1 non-settling handling) and lowers
// the resolved envelope through `routeToolReturnShape`, surfacing a
// non-conforming shape on the `return-shape-defect` outcome arm (off the
// `CodeToolError` surface) rather than binding garbage or throwing a raw
// `TypeError`. Per host-interfaces-
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
// theta code"; cancellation.md §Granularity; errors-and-results/
// queryerror-variants.md (§"Code-side tool-call variant");
// errors-and-results/error-model.md §"No rollback" (ERR-13).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { CommittedSideEffect } from "./no-rollback";
import type { CodeToolError } from "./query-error";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "./value";
// V14c live-seam wiring: this leaf INVOKES the V14c off-surface routings at the
// live execution surface. `tool-call-off-surface.ts` imports the accepted-path
// lowering (`lowerResolvedToolEnvelope`) and shared envelope types back from
// this module; the resulting import cycle is function-level only (both sides are
// called at runtime, never at module-eval), so the ESM live bindings resolve
// without a temporal-dead-zone hazard.
import {
  awaitToolSettlementOrAbort,
  routeToolReturnShape,
} from "./tool-call-off-surface";

// --------------------------------------------------------------------------
// AgentToolResult content-block shape (theta-load-bearing subset)
// --------------------------------------------------------------------------

/** A `type: "text"` content block — the only block theta lowers to output. */
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
 * The code-side `execute()` return type at the theta 1.0 Pi-SDK pin —
 * `AgentToolResult = { content, details, terminate? }` (host-interfaces-core.md
 * §"Tool execution from theta code"). theta reads only `content`; the type carries
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
 * (host-interfaces-core.md §"Tool execution from theta code"). Passed in so a
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
 * no text block survives (host-interfaces-core.md §"Tool execution from theta
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
 * `sink` (host-interfaces-core.md §"Tool execution from theta code").
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
 * theta code").
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
 * boundary rule (host-interfaces-core.md §"Tool execution from theta code").
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
  /**
   * A ceiling-#4 (JSON-document depth ≤5) breach on the CONSTRUCTED argument
   * value, detected by the theta-owned depth walk at the `<name>(args)` binding
   * site *before* AJV and *before* the tool executes (CIO-3, schema-subset.md
   * §Depth Enforcement point #3). When present, `runCodeSideToolCall` surfaces
   * the wrapped `Err(CodeToolError { cause: "validation" })` as the tool-call
   * outcome and NEVER dispatches — the `dispatch()` closure (and the host
   * tool's `execute()`) is not called and no side effect is committed. Absent
   * for a within-cap argument, which defers to the downstream AJV boundary.
   * Mirrors the invoke `params`-boundary breach that `enforceInvokeParamsDepth`
   * surfaces at invoke entry (ceilings-3-and-4.md#ceiling-4-table).
   */
  readonly argDepthBreach?: {
    readonly result: ResultValue;
    readonly error: CodeToolError;
  };
  /**
   * Bug 0072 §Fix runtime half (b): a pre-dispatch AJV rejection of the
   * constructed argument object against the resolved tool's registered
   * `parameters` schema, checked AFTER `argDepthBreach` and only when it is
   * absent (CIO-3 depth-walk-before-AJV). Same shape and short-circuit as
   * `argDepthBreach`: when present, `runCodeSideToolCall` surfaces the
   * wrapped `Err(CodeToolError { cause: "validation" })` and NEVER
   * dispatches — the `dispatch()` closure is not called and no side effect is
   * committed.
   */
  readonly argSchemaViolation?: {
    readonly result: ResultValue;
    readonly error: CodeToolError;
  };
  /**
   * Bug 0322 §Fix (settled route: mint-at-the-seam): a dispatch-time snapshot
   * miss — the resolver could not find a host tool for the callee name in the
   * frozen callable-set snapshot. Set only by the regime-inactive
   * `tool === undefined` arm of `#resolveToolCall`
   * (`src/extension/production-theta-producer.ts`), never by an ordinary
   * resolved call. When present, `runCodeSideToolCall` surfaces the wrapped
   * `Err(CodeToolError { cause: "unknown_tool" })` and NEVER dispatches —
   * distinct from `execution-error`, which is an `execute()` throw from a call
   * that DID dispatch.
   */
  readonly unknownHostTool?: {
    readonly result: ResultValue;
    readonly error: CodeToolError;
  };
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
  | {
      // Ceiling #4 (CIO-3): the constructed argument tripped the depth walk
      // before AJV / before the tool executed; `result` is the wrapped
      // `Err(CodeToolError { cause: "validation" })` and the tool never ran, so
      // `committed` is empty. Distinct from `execution-error` (which is an
      // `execute()` throw, `cause: "execution"`).
      readonly kind: "arg-depth-error";
      readonly result: ResultValue;
      readonly error: CodeToolError;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      // Bug 0072 §Fix runtime half (b): the constructed argument failed the
      // resolved tool's registered `parameters` schema at the AJV check —
      // `result` is the wrapped `Err(CodeToolError { cause: "validation" })`
      // and the tool never ran, so `committed` is empty. Checked strictly
      // AFTER `arg-depth-error` (CIO-3): a depth-6+ argument that also
      // violates the schema reports the depth breach, never this arm.
      // Distinct from `execution-error` (an `execute()` throw,
      // `cause: "execution"`).
      readonly kind: "arg-schema-error";
      readonly result: ResultValue;
      readonly error: CodeToolError;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      // Bug 0322 §Fix (settled route: mint-at-the-seam): a dispatch-time
      // snapshot miss — the callee name is absent from the frozen
      // callable-set snapshot, so `result` is the wrapped
      // `Err(CodeToolError { cause: "unknown_tool" })` and the tool never
      // ran, so `committed` is empty. Distinct from `execution-error` (an
      // `execute()` throw from a call that DID dispatch).
      readonly kind: "unknown-tool-error";
      readonly result: ResultValue;
      readonly error: CodeToolError;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      // V14c non-conforming return shape (host-interfaces-core.md §"Tool
      // execution from theta code"; tool-calls.md §"Outcome enumeration"): the
      // resolved `execute()` envelope violated the `{ content }` shape (not an
      // object, `content` not iterable, an entry missing `type` / `text`, or a
      // throwing inspection). Routed *off* the `CodeToolError` surface — the
      // only surface is the `theta/runtime/internal-error` `diagnostic` (carrying
      // `details.kind = "tool-return-shape"`, `details.tool_name`, and the
      // closed `details.shape_check` token). NOT observable as an
      // `Err(QueryError)` a theta author can `match` on; the caller
      // (`runToolCallEffect`) surfaces it as the internal-error routing per
      // errors-and-results.md §"Runtime panics". The tool never bound a value,
      // so `committed` is empty.
      readonly kind: "return-shape-defect";
      readonly diagnostic: Diagnostic;
      readonly committed: readonly CommittedSideEffect[];
    }
  | { readonly kind: "cancelled"; readonly committed: readonly CommittedSideEffect[] };

/**
 * Drive one code-side `<name>(args)` tool call on the live surface. Await
 * `checkpoint.before("tool-call", site)` immediately before the dispatch
 * (cka-47, V14g facet; cancellation.md §Granularity), read `signal.aborted`, and
 * skip the dispatch when it has fired. Otherwise race `call.dispatch()` against
 * `signal` via the V14c `awaitToolSettlementOrAbort` seam (NOCEIL-1: no internal
 * timeout) and route the outcome: an abort winning the race → `cancelled`; an
 * `execute()` throw → `Err(CodeToolError { cause: "execution", ... })`; a
 * cleanly-resolving envelope through the V14c `routeToolReturnShape` inspection
 * — a conforming `{ content }` envelope to `Ok(<joined text>)`, a non-conforming
 * shape to the `return-shape-defect` arm carrying the
 * `theta/runtime/internal-error{tool-return-shape}` diagnostic (off the
 * `CodeToolError` surface, NOT a bound value). The completed callee's
 * `committed` side effects are surfaced on the value outcome and remain final
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

  // Ceiling #4 (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table, the
  // code-driven tool-call args row; CIO-3 depth-walk-before-AJV): a depth-6+
  // constructed argument tripped the theta-owned depth walk at the binding site
  // — surface the wrapped `Err(CodeToolError { cause: "validation" })` and
  // NEVER dispatch, so the host tool's `execute()` is not called and no side
  // effect is committed. Ordered after the abort check so cancellation observed
  // at the checkpoint still preempts (mirroring the invoke path, where the
  // `params` depth check in `#driveCallee` runs after `runInvokeChild`'s
  // cancellation checkpoint + abort read).
  if (call.argDepthBreach !== undefined) {
    return {
      kind: "arg-depth-error",
      result: call.argDepthBreach.result,
      error: call.argDepthBreach.error,
      committed: [],
    };
  }

  // Bug 0072 §Fix runtime half (b): checked SECOND, only once the depth
  // ceiling has cleared (CIO-3 depth-walk-before-AJV) — never dispatches, so
  // the host tool's `execute()` is not called and no side effect is committed.
  if (call.argSchemaViolation !== undefined) {
    return {
      kind: "arg-schema-error",
      result: call.argSchemaViolation.result,
      error: call.argSchemaViolation.error,
      committed: [],
    };
  }

  // Bug 0322 §Fix (settled route: mint-at-the-seam): a dispatch-time snapshot
  // miss, set only by the regime-inactive `tool === undefined` arm of
  // `#resolveToolCall` — never dispatches, so the host tool's `execute()` is
  // not called and no side effect is committed.
  if (call.unknownHostTool !== undefined) {
    return {
      kind: "unknown-tool-error",
      result: call.unknownHostTool.result,
      error: call.unknownHostTool.error,
      committed: [],
    };
  }

  // NOCEIL-1 (host-interfaces-core.md §"Outcome routing summary"): theta 1.0
  // makes no internal timeout attempt. Race the `execute()` Promise against the
  // abort `signal` through the V14c `awaitToolSettlementOrAbort` seam — a
  // non-settling Promise blocks at this `await` until the signal fires, at which
  // point the cancelled path applies (no `internal-error`); a Promise that
  // settles first yields its envelope. `dispatch` is wrapped in a thunk so the
  // race constructs the Promise once (its swallowing reject handler attaches
  // before the first microtask boundary).
  let settlement;
  try {
    settlement = await awaitToolSettlementOrAbort(
      () => call.dispatch(),
      signal,
      call.toolName,
      sink,
    );
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    // A rejection arriving BEFORE cancellation surfaced is an `execute()` throw:
    // the Pi tool signals failure by throwing an arbitrary value owned by the Pi
    // SDK whose runtime shape theta cannot statically guarantee. It lowers to
    // `CodeToolError { cause: "execution" }` (host-interfaces-core.md §"Tool
    // execution from theta code"); the completed callee's committed side effects
    // remain final per ERR-13. (A rejection AFTER cancellation is swallowed by
    // `awaitToolSettlementOrAbort`'s post-cancel discard arm and never reaches
    // here.)
    const error = lowerToolExecuteThrow(thrown, call.toolName);
    return {
      kind: "execution-error",
      result: makeErr(error as unknown as ThetaValue),
      error,
      committed: call.committed,
    };
  }

  if (settlement.kind === "cancelled") {
    // The abort won the race while the tool was still in flight: surface the
    // cancelled outcome (cancellation.md §"Race semantics"). The tool did not
    // complete on this surface, so no side effect is surfaced here; the
    // abandoned dispatch Promise's late settlement is discarded by
    // `awaitToolSettlementOrAbort` (CNCL-1/2/3) and any late rejection is
    // swallowed by its construction-time reject handler.
    return { kind: "cancelled", committed: [] };
  }

  // Clean resolution: route the resolved envelope through the V14c
  // `routeToolReturnShape` inspection BEFORE it binds. A conforming `{ content }`
  // envelope lowers to `Ok(<filtered/joined text>)` (possibly `Ok("")`) and the
  // completed callee's committed side effects ride on the outcome so the ERR-13
  // completed-callee-finality witness stays assertable off this surface. A
  // non-conforming shape does NOT bind a value: it routes to
  // `theta/runtime/internal-error` with `details.kind = "tool-return-shape"`,
  // off the `CodeToolError` surface (host-interfaces-core.md §"Tool execution
  // from theta code").
  const shape = routeToolReturnShape(
    settlement.envelope,
    call.toolName,
    { file: site.file, range: { start: { line: site.line, column: site.column }, end: { line: site.line, column: site.column } } },
    sink,
  );
  if (shape.kind === "conforming") {
    return { kind: "value", result: shape.result, committed: call.committed };
  }
  // Emit the runtime-defect diagnostic on the lowering sink (the designated
  // channel) and surface the defect on its own outcome arm. `runToolCallEffect`
  // routes it as the internal-error path — NOT a bound `Err(CodeToolError)`.
  sink.diagnostic(shape.diagnostic);
  return { kind: "return-shape-defect", diagnostic: shape.diagnostic, committed: [] };
}
