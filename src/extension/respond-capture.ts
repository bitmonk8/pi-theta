// The typed query's respond-capture contract: the registered respond tool's identity and description, the one-shot early-respond capture slot, the respond-turn context, and the tool's execute-result shapes.

import type { Api, Model, Tool } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { LoweredSchema } from "../seams/schema-validator";
import type { TransportError } from "../runtime/query-error";
import { respondToolWireSchema } from "../runtime/respond-tool-wire";

/** The fixed respond-tool description (bug-0010 design brief §Slug / naming). */
const RESPOND_TOOL_DESCRIPTION =
  "Return the final answer for the typed query, conforming to the response schema.";

/**
 * The one-shot capture acknowledgements a respond-tool call is answered with
 * (bug 0010): the FIRST valid call records the final answer; a repeat valid
 * call is acknowledged inertly (not an error). Shared by the live capture
 * slot's `execute` and the off-session held-conversation servicing so the two
 * drivers answer the model identically.
 */
const RESPOND_CAPTURED_TEXT = "final answer recorded";
const RESPOND_REPEAT_TEXT = "final answer already recorded";

/**
 * Bug 0010 (QRY-14 early respond): the one-shot capture slot armed around each
 * driven typed free-phase turn. The PERMANENTLY registered respond tool's
 * `execute` dispatches into the producer's current slot, so a registration
 * that outlives its query can never capture outside a live typed turn. The
 * slot object is created per driven turn by the live driver, which keeps its
 * own reference and reads `captured`/`payload` back after the turn settles.
 */
interface ActiveRespondCapture {
  /** The registered respond-tool name this capture belongs to. */
  readonly toolName: string;
  /** AJV verdict over the lowered response schema (QRY-14 execute validation). */
  readonly validate: (
    payload: unknown,
  ) => { readonly ok: true } | { readonly ok: false; readonly message: string };
  /** One-shot: the FIRST valid call wins; later valid calls acknowledge inertly. */
  captured: boolean;
  payload?: unknown;
}

/** The producer's capture-slot accessor handed to the live driver (narrow closures). */
interface RespondCaptureHost {
  setActiveCapture(capture: ActiveRespondCapture): void;
  clearActiveCapture(): void;
}

/**
 * Bug 0010 (QRY-14 step 2): the LIVE typed query's respond-turn machinery —
 * the registered `__theta_respond_<slug>` identity, the lowered response
 * schema, the QRY-15 template, the resolved respond model with auth/signal
 * threading for the off-session `complete()` dispatch, the early-respond AJV
 * verdict, and the producer's capture-slot accessor.
 */
interface RespondTurnContext {
  /** The PIC-44 registered tool name (collision-disambiguated when applicable). */
  readonly toolName: string;
  readonly lowered: LoweredSchema;
  /** The QRY-15 initial respond-turn template (`renderInitialRespondTurn`). */
  readonly template: string;
  /** The resolved respond model: theta `model:` → registry match, else `ctx.model`. */
  readonly model: Model<Api> | undefined;
  /** Resolve the respond dispatch's request auth (apiKey/headers), when available. */
  readonly auth: () => Promise<
    { readonly apiKey?: string; readonly headers?: Record<string, string> } | undefined
  >;
  /** The theta signal, threaded as `options.signal` (cancellation). */
  readonly signal: AbortSignal;
  /** The early-respond `execute`'s AJV verdict (same lowered schema as the loop). */
  readonly validate: ActiveRespondCapture["validate"];
  readonly captureHost: RespondCaptureHost;
  /**
   * Bug 0010 increment C (conversation-drive.md §"Provider compatibility for
   * typed queries"): the RUNTIME provider gate's refusal, set when the
   * resolved respond model's api-shaped `.api` is outside
   * `TYPED_QUERY_SUPPORTED_PROVIDER_APIS`. When present, the typed query
   * refuses BEFORE any provider traffic — `nextFreePhaseTurn` round 0 and
   * `forcedRespondTurn` (the `max_rounds: 0` entry point) both short-circuit
   * to `Err(TransportError)` with zero sends and zero `complete()` calls.
   */
  readonly gateError?: TransportError;
}

/**
 * The respond tool's `execute` result: pi's `AgentToolResult` content/details
 * plus the `isError` flag fed back to the model as a tool-error result.
 */
interface RespondToolExecuteResult {
  content: { type: "text"; text: string }[];
  details: undefined;
  isError: boolean;
}

/** Lower one respond-tool `execute` disposition to its result shape. */
function respondToolExecuteResult(text: string, isError: boolean): RespondToolExecuteResult {
  return { content: [{ type: "text", text }], details: undefined, isError };
}

/**
 * The synthesised respond tool as a pi-ai `Tool` entry: the PIC-44 registered
 * name, the fixed description literal, and the response schema's WIRE form as
 * `parameters` (the same `Type.Unsafe` wrap the binder call shape uses; bug
 * 0028 §Fix envelopes a non-object lowered root, which no argument object can
 * satisfy). ONE builder feeds the forced respond dispatch's `context.tools` AND
 * the off-session free phase's presentation (bug 0010 increment D), so the tool
 * the model sees mid-loop and the tool the provider is forced to are
 * byte-identical by construction.
 */
function respondToolEntry(respond: RespondTurnContext): Tool {
  return {
    name: respond.toolName,
    description: RESPOND_TOOL_DESCRIPTION,
    parameters: Type.Unsafe<unknown>(respondToolWireSchema(respond.lowered)),
  };
}

export { RESPOND_TOOL_DESCRIPTION, RESPOND_CAPTURED_TEXT, RESPOND_REPEAT_TEXT, respondToolExecuteResult, respondToolEntry };
export type { ActiveRespondCapture, RespondCaptureHost, RespondTurnContext, RespondToolExecuteResult };
