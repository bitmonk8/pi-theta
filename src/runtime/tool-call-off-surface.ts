// V14c / V14c-T — code-side tool-call off-surface outcome routing.
//
// This module owns the runtime seam the paired `V14c` implementation leaf fills
// in for the four code-tool execution outcomes deliberately routed *off* the
// closed `CodeToolError.cause` surface, each onto its own channel rather than
// all onto `loom/runtime/internal-error` (tool-calls.md §"Outcome enumeration";
// pi-integration-contract/host-interfaces-core.md §"Tool execution from loom
// code" §"Outcome routing summary"; cancellation.md §"Race semantics"):
//
//   1. `routeLoomCallableSetupThrow` — a *pre-evaluation setup throw* inside the
//      `.loom`-callable parallel-batch adapter (one of the dispatch-site setup
//      steps in active-invocation-registry.md raising before the loom body
//      runs). The adapter MUST translate the captured error into a clean
//      `{ isError: true, content: [{ type: "text", text: "loom <name> aborted
//      with internal error: <error.message>" }] }` value — where `<name>` is the
//      bare callable-set entry name (post-`as`, post-hyphen→underscore rewrite),
//      deliberately **not** the slash-prefixed `/<name>` form — and return it to
//      Pi normally; in parallel, the runtime emits exactly one
//      `loom/runtime/internal-error` diagnostic (message carrying `error.message`,
//      hint carrying `error.stack` or `"<no stack available>"` when falsy) and
//      exactly one `loom-system-note`.
//   2. `routeToolReturnShape` — a *non-conforming return shape* (the resolved
//      value is not an object, `content` is not iterable, an entry is missing
//      `type` / `text`, etc.) routes through `loom/runtime/internal-error` with
//      `details.kind = "tool-return-shape"` (carrying `details.tool_name` and the
//      closed-vocabulary `details.shape_check` discriminator), **not** through
//      `CodeToolError`.
//   3. `awaitToolSettlementOrAbort` — a *non-settling Promise* makes no loom 1.0
//      internal timeout attempt (NOCEIL-1): the tool-call expression blocks at
//      its `await` until `loomAbort.signal` fires, at which point cancellation
//      surfaces through the existing `cause: "cancelled"` path with **no**
//      `internal-error`.
//   4. `discardPostCancelSettlement` — a *post-cancel late settlement* arriving
//      after the tool-call checkpoint has already surfaced `cause: "cancelled"`
//      is discarded per CNCL-1 (no rebind), CNCL-2 (no second `Err`), and CNCL-3
//      (no second `RuntimeEvent`) — and emits no diagnostic of any severity, so
//      no `internal-error` either.
//
// V14c fills in each behaviour-bearing function on the live routing surface:
//   - `routeLoomCallableSetupThrow` translates the captured setup throw into the
//     clean `{ isError: true, content: [ text ] }` value (bare callable-set
//     name) and emits exactly one `internal-error` diagnostic + one
//     `loom-system-note`,
//   - `routeToolReturnShape` inspects the resolved envelope in the lowering
//     procedure's inspection order and routes a non-conforming shape to
//     `internal-error{tool-return-shape}` (off the `CodeToolError` surface),
//     lowering a conforming envelope to `Ok(<joined text>)`,
//   - `awaitToolSettlementOrAbort` races the `execute()` Promise against
//     `loomAbort.signal` (no internal timeout, NOCEIL-1) and surfaces the
//     cancelled path with no `internal-error`, keeping a swallowing rejection
//     handler attached from construction,
//   - `discardPostCancelSettlement` is a total no-op — no rebind (CNCL-1), no
//     second `Err` (CNCL-2), no second `RuntimeEvent` (CNCL-3), no diagnostic of
//     any severity, and the discarded value is not traversed.
//
// Spec: tool-calls.md §"Outcome enumeration", cancellation.md §"Race semantics"
// (CNCL-1/CNCL-2/CNCL-3); pi-integration-contract/host-interfaces-core.md
// §"Tool execution from loom code".

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { CodeToolError } from "./query-error";
import { INTERNAL_ERROR_CODE } from "./runtime-panics";
import type { LoomValue, ResultValue } from "./value";
import {
  lowerResolvedToolEnvelope,
  type AgentToolResultEnvelope,
  type ToolLoweringSink,
  type ToolTextBlock,
} from "./tool-call-execute";

/** A located dispatch/lowering site for the runtime-defect diagnostic. */
export interface OffSurfaceSite {
  readonly file: string;
  readonly range: SourceRange;
}

// --------------------------------------------------------------------------
// (1) Pre-evaluation setup throw inside the `.loom`-callable parallel-batch
// adapter → clean `{ isError: true, ... }` return + one `internal-error`
// diagnostic + one `loom-system-note` (tool-calls.md §"Outcome enumeration").
// --------------------------------------------------------------------------

/**
 * The value the `.loom`-callable parallel-batch adapter returns to Pi on a
 * pre-evaluation setup throw: a clean `{ isError: true, content: [ text ] }`
 * envelope carrying the bare callable-set name in its message (never the
 * slash-prefixed `/<name>` form).
 */
export interface LoomCallableAdapterResult {
  readonly isError: boolean;
  readonly content: readonly ToolTextBlock[];
}

/**
 * Route a pre-evaluation setup throw inside the `.loom`-callable parallel-batch
 * adapter (tool-calls.md §"Outcome enumeration", "Pre-evaluation setup throw
 * inside the `.loom`-callable adapter"). Translate the captured `thrown` into a
 * clean `{ isError: true, content: [{ type: "text", text: "loom <name> aborted
 * with internal error: <error.message>" }] }` value returned to Pi normally,
 * where `<name>` is the bare `callableName` (never `/<name>`); in parallel emit
 * exactly one `loom/runtime/internal-error` diagnostic (message carrying
 * `error.message`, hint carrying `error.stack` or `"<no stack available>"`) and
 * exactly one `loom-system-note` on `sink`.
 *
 * V14c-T stubs this to an inert non-error empty envelope that emits nothing, so
 * the `{ isError: true }` text, one-diagnostic, and one-system-note assertions
 * red on their own.
 */
export function routeLoomCallableSetupThrow(
  thrown: unknown,
  callableName: string,
  site: OffSurfaceSite,
  sink: ToolLoweringSink,
): LoomCallableAdapterResult {
  // The captured setup throw's `.message` / `.stack` are read the same way the
  // runtime-defect surface reads them (runtime-panics.ts `surfaceUnexpectedThrow`):
  // a string `message` is used verbatim, otherwise the value is coerced; a falsy
  // `stack` renders as `"<no stack available>"` for operator triage.
  const errorLike = thrown as { readonly message?: unknown; readonly stack?: unknown };
  const message =
    typeof errorLike.message === "string" ? errorLike.message : String(thrown);
  const stack =
    typeof errorLike.stack === "string" && errorLike.stack.length > 0
      ? errorLike.stack
      : "<no stack available>";

  // The single author-visible framing carries the *bare* callable-set name
  // (post-`as`, post-hyphen→underscore rewrite) — deliberately NOT the
  // slash-prefixed `/<name>` form, because this adapter is entered from the
  // model's parallel-tool batch and carries no slash context
  // (tool-calls.md §"Outcome enumeration").
  const framing = `loom ${callableName} aborted with internal error: ${message}`;

  // In parallel with the returned `{ isError: true }` value, the runtime emits
  // exactly one `loom/runtime/internal-error` diagnostic and exactly one
  // `loom-system-note` so an operator observes the failure even though the
  // model's surface is the tool result.
  sink.diagnostic({
    severity: "error",
    code: INTERNAL_ERROR_CODE,
    file: site.file,
    range: site.range,
    message: `internal error: ${message}`,
    hint: stack,
  });
  sink.systemNote(framing);

  return {
    isError: true,
    content: [{ type: "text", text: framing }],
  };
}

// --------------------------------------------------------------------------
// (2) Non-conforming return shape → `loom/runtime/internal-error` with
// `details.kind = "tool-return-shape"` (NOT a `CodeToolError`)
// (host-interfaces-core.md §"Tool execution from loom code").
// --------------------------------------------------------------------------

/**
 * The closed-vocabulary `details.shape_check` discriminator naming which
 * envelope-shape check failed, in the runtime's inspection order (the
 * first-failing token is emitted when a single envelope violates more than one
 * check) — code-registry-runtime.md `loom/runtime/internal-error` *Trigger*.
 */
export type ToolReturnShapeCheck =
  | "resolved-not-object"
  | "content-not-iterable"
  | "entry-missing-type"
  | "entry-missing-text"
  | "other";

/**
 * The disposition of inspecting a resolved code-side `execute()` value:
 *   - `conforming` — the `{ content }` envelope is well-formed; `result` is the
 *     lowered `Ok(<joined text>)`;
 *   - `return-shape-defect` — a shape violation threw during lowering; the
 *     `loom/runtime/internal-error` `diagnostic` (with `details.kind =
 *     "tool-return-shape"`) is the *only* surface — no `CodeToolError`.
 */
export type ToolReturnShapeOutcome =
  | { readonly kind: "conforming"; readonly result: ResultValue }
  | { readonly kind: "return-shape-defect"; readonly diagnostic: Diagnostic };

/**
 * Inspect a resolved code-side `execute()` value. A conforming `{ content }`
 * envelope lowers to `Ok(<joined text>)`; a non-conforming shape routes through
 * `loom/runtime/internal-error` with `details.kind = "tool-return-shape"` (plus
 * `details.tool_name` and the closed `details.shape_check` token), emitted on
 * `sink`, and is **not** observable as a `CodeToolError`
 * (host-interfaces-core.md §"Tool execution from loom code").
 *
 * V14c-T stubs this to an inert `conforming` outcome that emits nothing, so the
 * `return-shape-defect` / `details.kind` / not-`CodeToolError` assertions red.
 */
export function routeToolReturnShape(
  resolved: unknown,
  toolName: string,
  site: OffSurfaceSite,
  sink: ToolLoweringSink,
): ToolReturnShapeOutcome {
  const check = inspectReturnShape(resolved);
  if (check === null) {
    // A well-formed `{ content }` envelope lowers to `Ok(<filtered/joined text>)`
    // (possibly `Ok("")`). The non-text discard emits nothing on `sink`.
    return {
      kind: "conforming",
      result: lowerResolvedToolEnvelope(resolved as AgentToolResultEnvelope, sink),
    };
  }

  // A non-conforming shape routes through `loom/runtime/internal-error` with
  // `details.kind = "tool-return-shape"` (plus `details.tool_name` and the
  // closed `details.shape_check` token) and is deliberately routed *off* the
  // `CodeToolError` surface — a non-conforming Pi tool is a defect in that
  // tool, not a value loom authors can usefully `match` on
  // (host-interfaces-core.md §"Tool execution from loom code").
  return {
    kind: "return-shape-defect",
    diagnostic: {
      severity: "error",
      code: INTERNAL_ERROR_CODE,
      file: site.file,
      range: site.range,
      message: `internal error: tool ${toolName} returned a non-conforming result envelope`,
      details: {
        kind: "tool-return-shape",
        tool_name: toolName,
        shape_check: check,
      },
    },
  };
}

/**
 * Inspect a resolved code-side `execute()` value in the lowering procedure's
 * inspection order and return the first-failing `details.shape_check` token, or
 * `null` when the `{ content }` envelope is well-formed
 * (host-interfaces-core.md §"Tool execution from loom code";
 * code-registry-runtime.md `loom/runtime/internal-error` *Trigger*). The order —
 * `resolved-not-object` → `content-not-iterable` → `entry-missing-type` →
 * `entry-missing-text` — is the order the caller emits when a single envelope
 * violates more than one check; any shape violation that throws during
 * inspection (e.g. a hostile property getter on the Pi-owned value) is the
 * `"other"` token.
 */
function inspectReturnShape(resolved: unknown): ToolReturnShapeCheck | null {
  try {
    if (typeof resolved !== "object" || resolved === null) {
      return "resolved-not-object";
    }
    const content = (resolved as { readonly content?: unknown }).content;
    const iterFn = (content as { readonly [Symbol.iterator]?: unknown } | null | undefined)?.[
      Symbol.iterator
    ];
    if (typeof iterFn !== "function") {
      return "content-not-iterable";
    }
    for (const entry of content as Iterable<unknown>) {
      if (typeof entry !== "object" || entry === null || !("type" in entry)) {
        return "entry-missing-type";
      }
      if ((entry as { readonly type?: unknown }).type === "text" && !("text" in entry)) {
        return "entry-missing-text";
      }
    }
    return null;
  } catch (shapeThrow: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    // The inspected `resolved` value is owned by the Pi tool's `execute()`; a
    // hostile getter, `Proxy`, or `null`-prototype object may throw on a
    // property access or during iteration. Any such throw is the `"other"`
    // shape violation outside the four named checks.
    void shapeThrow;
    return "other";
  }
}

// --------------------------------------------------------------------------
// (3) Non-settling Promise → block at the `await` until `loomAbort.signal`
// fires, surfacing `cause: "cancelled"` with NO `internal-error`
// (tool-calls.md §"Outcome enumeration"; NOCEIL-1).
// --------------------------------------------------------------------------

/**
 * The outcome of awaiting a code-side tool-call `execute()` Promise against the
 * invocation's `loomAbort.signal`:
 *   - `settled` — the Promise settled first; `envelope` is the resolved value;
 *   - `cancelled` — `loomAbort.signal` fired first (loom 1.0 makes no internal
 *     timeout attempt); `error` is the `CodeToolError { cause: "cancelled" }`
 *     surfaced through the existing cancelled path, with no `internal-error`.
 */
export type ToolSettlementOutcome =
  | { readonly kind: "settled"; readonly envelope: AgentToolResultEnvelope }
  | { readonly kind: "cancelled"; readonly error: CodeToolError };

/**
 * Await `dispatch()`'s `execute()` Promise against `signal`. loom 1.0 makes no
 * internal timeout attempt (NOCEIL-1): a non-settling Promise blocks at this
 * `await` until `signal` fires, at which point the call surfaces
 * `{ kind: "cancelled", error: CodeToolError { cause: "cancelled", ... } }` —
 * emitting **no** `loom/runtime/internal-error` on `sink`. A settling Promise
 * yields `{ kind: "settled", envelope }`.
 *
 * V14c-T stubs this to an inert `settled` sentinel returned *without* awaiting
 * `dispatch` (so a never-settling dispatch cannot hang the test), so the
 * `cancelled`-path assertion reds on its own.
 */
export function awaitToolSettlementOrAbort(
  dispatch: () => Promise<AgentToolResultEnvelope>,
  signal: AbortSignal,
  toolName: string,
  sink: ToolLoweringSink,
): Promise<ToolSettlementOutcome> {
  // loom 1.0 makes no internal timeout attempt (NOCEIL-1); the cancelled path
  // emits NOTHING on `sink` (no `loom/runtime/internal-error`) — cancellation
  // surfaces through the existing `cause: "cancelled"` path.
  void sink;

  // The `execute()` Promise is constructed once, up front, so its settlement
  // handler is attached before the first microtask boundary: a late rejection
  // arriving after cancellation surfaced is absorbed by the `onReject` arm
  // below (which is a rejection handler on `execPromise`), so it never surfaces
  // as a Node `unhandledRejection` process event (cancellation.md §"Race
  // semantics — swallowing-handler attachment").
  const execPromise = dispatch();

  return new Promise<ToolSettlementOutcome>((resolve, reject) => {
    let settled = false;

    const onAbort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      // A non-settling (or still-pending) Promise blocked at its `await` until
      // `loomAbort.signal` fired: surface `CodeToolError { cause: "cancelled" }`
      // per the cancellation surfacing rule, with no `internal-error`.
      resolve({
        kind: "cancelled",
        error: {
          kind: "code_tool",
          message: "tool call cancelled",
          tool_name: toolName,
          cause: "cancelled",
        },
      });
    };

    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    execPromise.then(
      (envelope) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) {
          return;
        }
        settled = true;
        resolve({ kind: "settled", envelope });
      },
      (reason: unknown) => {
        signal.removeEventListener("abort", onAbort);
        // A rejection arriving after cancellation already surfaced is discarded
        // here (the `settled` guard) — this arm is the swallowing handler that
        // keeps a late reject off the `unhandledRejection` channel. A rejection
        // *before* cancellation is an `execute()` throw and propagates to the
        // caller's execution-error lowering.
        if (settled) {
          return;
        }
        settled = true;
        reject(reason);
      },
    );
  });
}

// --------------------------------------------------------------------------
// (4) Post-cancel late settlement → discarded per CNCL-1 / CNCL-2 / CNCL-3
// (no rebind, no second `Err`, no second `RuntimeEvent`, no `internal-error`)
// (cancellation.md §"Race semantics").
// --------------------------------------------------------------------------

/** A late settlement of the underlying `execute()` Promise after cancellation surfaced. */
export type LateSettlement =
  | { readonly kind: "resolve"; readonly envelope: AgentToolResultEnvelope }
  | { readonly kind: "reject"; readonly reason: unknown };

/**
 * The forbidden side channels a *compliant* post-cancel discard must never
 * touch: rebinding the call site (CNCL-1), emitting a second `Err` (CNCL-2),
 * emitting a second `RuntimeEvent` (CNCL-3), or emitting any diagnostic (so no
 * `internal-error`). Passed in so a test can witness that a compliant discard
 * touches none of them.
 */
export interface LateSettlementObserver {
  /** CNCL-1 — the runtime MUST NOT rebind the call site to the late value. */
  rebind(value: LoomValue): void;
  /** CNCL-2 — the runtime MUST NOT emit a second `Err` for the same invocation. */
  emitErr(error: LoomValue): void;
  /** CNCL-3 — the runtime MUST NOT emit a second `RuntimeEvent` for the same invocation. */
  emitRuntimeEvent(event: RuntimeEvent): void;
  /** No diagnostic of any severity (so no `loom/runtime/internal-error`). */
  diagnostic(diag: Diagnostic): void;
}

/**
 * Discard a late settlement arriving after the tool-call checkpoint already
 * surfaced `cause: "cancelled"` (cancellation.md §"Race semantics"). The discard
 * is total: no rebind (CNCL-1), no second `Err` (CNCL-2), no second
 * `RuntimeEvent` (CNCL-3), and no diagnostic of any severity — a late rejection
 * whose `.message` would otherwise be diagnostic-worthy is still discarded, so
 * no `loom/runtime/internal-error`. The discarded value is not traversed.
 *
 * V14c-T stubs this to the *non-discarding* behaviour CNCL-1/2/3 forbid — it
 * forwards the late settlement to `observer` — so the no-rebind / no-second-`Err`
 * / no-second-`RuntimeEvent` / no-`internal-error` assertions red. The paired
 * V14c leaf makes this a total no-op.
 */
export function discardPostCancelSettlement(
  late: LateSettlement,
  observer: LateSettlementObserver,
): void {
  // Total discard: once the tool-call checkpoint has surfaced `cause:
  // "cancelled"`, a later settlement of the underlying `execute()` Promise is
  // dropped on the floor — no rebind (CNCL-1), no second `Err` (CNCL-2), no
  // second `RuntimeEvent` (CNCL-3), and no diagnostic of any severity (an
  // `OOMError`-style late reject is still discarded; promoting it to
  // `loom/runtime/internal-error` would re-introduce the second-event surface
  // these rules forbid). The discarded value is not traversed — `late` is not
  // inspected — so cleanup of any handles it carries is the tool's
  // responsibility, not the runtime's (cancellation.md §"Race semantics").
  void late;
  void observer;
}
