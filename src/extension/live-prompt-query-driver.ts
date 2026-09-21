// Live prompt-query turns, turn settlement, and off-session forced respond dispatch.

import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model, ProviderResponse, Tool, ToolCall } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import type { Clock, TimerHandle } from "../seams/clock";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";
import { extractTrailingTurnText, computeActiveSetInstall, type CallableSetInstall } from "../runtime/conversation-drive";
import { extractPromptModeQueryResult, mapPromptModeSyncThrow, mapPromptModeTurnLifecycleExpiry, PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE, type PromptModeTurnLifecyclePhase } from "../runtime/prompt-transport-mapping";
import type { ForcedRespondTurn, FreePhaseTurn, QueryModelDriver } from "../runtime/query-tool-loop";
import type { CommittedSideEffect } from "../runtime/no-rollback";
import type { ContextOverflowError, ForcedRespondBranch, TransportError } from "../runtime/query-error";
import { forwardSlashCommandCancel, abortForAgentEnd, makeCancelledError } from "../runtime/cancellation-core";
import type { LoweredSchema } from "../seams/schema-validator";
import { parseStructuredPayload, payloadForRespond, type FollowUpDriveFailure, type FollowUpRespondOutcome } from "../runtime/typed-query-validation";
import { respondPayloadFromWire, respondToolWireSchema } from "../runtime/respond-tool-wire";
import { withActiveSetGate, withModelWindow, type ActiveSetGateDeps, type ModelWindowDeps } from "../runtime/tool-registration";
import { forcedToolChoiceForApi, isForcedToolChoiceRejection } from "../binder/forced-tool-choice";
import { classifyProviderResponse } from "../binder/provider-error-mapping";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { PromptToolLoopGovernor, type PromptToolLoopExhaustion } from "./prompt-tool-loop-governor";

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
 * Bug 0373 §Fix: the narrow ExtensionAPI subset `LivePromptQueryModel` stores.
 * A stored `#pi: ExtensionAPI` class field is the inventory-closure audit's
 * prohibited non-parameter carrier binding (audit-recognised-shapes.md family
 * (4)) — it would let any `this.#pi.<member>` reach escape audit coverage. A
 * `Pick`-narrowed structural cap consumes exactly the members used and is not a
 * carrier binding, mirroring production-host-loop-dispatch.ts's `HostLoopPi`.
 * `getActiveTools`/`setActiveTools` are threaded whole into `ActiveSetGateDeps`.
 */
type LivePromptQueryPi = Pick<
  ExtensionAPI,
  "sendMessage" | "sendUserMessage" | "getActiveTools" | "setActiveTools" | "setModel"
>;
/**
 * Bug 0373 §Fix: the narrow ExtensionCommandContext subset the model stores (see
 * `LivePromptQueryPi`). `model` is the PIC-17 model window's step-1a snapshot
 * source (bug 0479), read at each turn so the swap compares against the
 * session's CURRENT model.
 */
type LivePromptQueryCtx = Pick<ExtensionCommandContext, "abort" | "isIdle" | "model" | "signal" | "waitForIdle">;

/**
 * The live prompt-mode `QueryModelDriver` (`V12a`/`V9c`): it drives real
 * user-visible turns into the shared user session. `nextFreePhaseTurn` issues
 * the rendered query as a streamed user turn (`pi.sendUserMessage`) and awaits
 * `ctx.waitForIdle()` so the assistant streams into the transcript before the
 * interpreter resumes (SLSH-2), then extracts the trailing-turn assistant text
 * (PIC-53) as the plain-text terminating turn.
 *
 * Bug 0010: for a typed query (a present `respond` context) the driver runs
 * the restored TWO-PHASE shape — the free phase on-session (respond tool in
 * the PIC-17 install vector, early-respond capture armed, governor bounding
 * the native loop per CIO-4) and the forced respond turn OFF-SESSION through
 * pi-ai `complete()` with the provider's tool choice forced to the respond
 * tool (`dispatchForcedRespondTurn`), attaching no session turn.
 */
class LivePromptQueryModel implements QueryModelDriver {
  readonly #pi: LivePromptQueryPi;
  readonly #ctx: LivePromptQueryCtx;
  readonly #clock: Clock;
  readonly #queryText: string;
  readonly #readMessages: () => readonly Message[];
  /** Bug 0482: the chronological leaf path `thisTurnSettled` checks for an unanswered trailing compaction. */
  readonly #readContextPath: () => readonly SessionEntry[];
  readonly #activeTools: readonly string[];
  readonly #thetaAbort: AbortController;
  /** STAGE B: bounds the native tool loop (armed for typed and untyped alike — bug 0010). */
  readonly #governor: PromptToolLoopGovernor;
  readonly #maxRounds: number;
  /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
  readonly #provider: string;
  /** Bug 0010: the typed query's respond-turn machinery (absent = untyped / degraded). */
  readonly #respond: RespondTurnContext | undefined;
  /** Bug 0372 §Fix: the bare theta name substituted into the PIC-8(c) note template. */
  readonly #thetaName: string;
  /** Bug 0372 §Fix: the runtime-defect diagnostic sink the PIC-8(b) restore-failure diagnostic emits through. */
  readonly #emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** Bug 0437 §Fix: the extension-instance `theta-system-note` channel; `undefined` on a bare-`pi` harness (resolved to a `pi`-built fallback at each use site). */
  readonly #systemNoteChannel: SystemNoteChannelDeps | undefined;
  /**
   * Bug 0479 (PIC-17 model window): the theta-resolved `model:` the free-phase
   * turn must run under — `undefined` when frontmatter omits `model:` (inherit;
   * the window is inert) AND when a present reference no longer resolves (then
   * `#queryModelRef` is set and the turn is refused before any send).
   */
  readonly #queryModel: Model<Api> | undefined;
  /** The authored `model:` reference, for the unresolvable-at-dispatch refusal message. */
  readonly #queryModelRef: string | undefined;
  /** The exhaustion snapshot captured after the bounded free-phase turn settled. */
  #exhaustion: PromptToolLoopExhaustion | undefined = undefined;
  /** PIC-50: a `TransportError` synthesised from a `sendUserMessage` sync-throw. */
  #transportFromThrow: TransportError | undefined = undefined;
  /** Bug 0010: whether a free-phase turn was driven (false at `max_rounds: 0`). */
  #freePhaseDriven = false;
  /**
   * Bug 0010 (PIC-53 window): the session message-list length recorded
   * immediately BEFORE the query's first `sendUserMessage` — the query-window
   * start the off-session respond turn rebuilds its conversation from.
   */
  #queryWindowStart: number | undefined = undefined;
  /** Bug 0010: the early-respond snapshot read back after each driven turn. */
  #earlyRespond: { readonly captured: boolean; readonly payload?: unknown } = {
    captured: false,
  };
  /**
   * Bug 0319 (cancellation.md §"Forwarding into `thetaAbort`", bidirectional
   * prompt-mode clause): guards the reverse `thetaAbort` -> `ctx.abort()`
   * propagation so a re-entrant `thetaAbort.abort()` does not double-cancel
   * the unwrapped Pi-supplied run. The flag lives on this per-`@`-query model
   * and is never reset; combined with the listener's already-aborted attach
   * guard (a later query's model never attaches after the abort), `ctx.abort()`
   * fires at most once for the whole invocation — the spec's one-shot guard.
   */
  #promptCancelPropagated = false;

  constructor(deps: {
    readonly pi: LivePromptQueryPi;
    readonly ctx: LivePromptQueryCtx;
    readonly clock: Clock;
    readonly queryText: string;
    readonly readMessages: () => readonly Message[];
    /** Bug 0482: the chronological leaf path, threaded alongside `readMessages`. */
    readonly readContextPath: () => readonly SessionEntry[];
    /** QTL-4: the theta's callable-set underlying Pi-tool names to install for the turn. */
    readonly activeTools: readonly string[];
    /** CANCEL-2: the per-invocation controller `ctx.signal` is re-forwarded into per turn. */
    readonly thetaAbort: AbortController;
    /** STAGE B / CIO-4: the round-cap governor for the driven free-phase turns. */
    readonly governor: PromptToolLoopGovernor;
    /** STAGE B: the theta's `tool_loop.max_rounds` for this query. */
    readonly maxRounds: number;
    /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
    readonly provider: string;
    /** Bug 0010: the typed respond-turn machinery (absent = untyped / degraded arm). */
    readonly respond?: RespondTurnContext;
    /** Bug 0372 §Fix: the bare theta name (no leading `/`) for the PIC-8(c) note template. */
    readonly thetaName: string;
    /** Bug 0372 §Fix: the runtime-defect diagnostic sink. */
    readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
    /** Bug 0437 §Fix: the extension-instance `theta-system-note` channel, threaded from `#input.systemNoteChannel`. */
    readonly systemNoteChannel?: SystemNoteChannelDeps;
    /** Bug 0479: the theta-resolved `model:` (absent = inherit the session model, no window). */
    readonly queryModel?: Model<Api>;
    /** Bug 0479: the authored `model:` reference (present iff frontmatter carries one). */
    readonly queryModelRef?: string;
  }) {
    this.#queryModel = deps.queryModel;
    this.#queryModelRef = deps.queryModelRef;
    this.#pi = deps.pi;
    this.#ctx = deps.ctx;
    this.#clock = deps.clock;
    this.#queryText = deps.queryText;
    this.#readMessages = deps.readMessages;
    this.#readContextPath = deps.readContextPath;
    this.#activeTools = deps.activeTools;
    this.#thetaAbort = deps.thetaAbort;
    this.#governor = deps.governor;
    this.#maxRounds = deps.maxRounds;
    this.#provider = deps.provider;
    this.#respond = deps.respond;
    this.#thetaName = deps.thetaName;
    this.#emitDiagnostic = deps.emitDiagnostic;
    this.#systemNoteChannel = deps.systemNoteChannel;
  }

  /**
   * Bug 0437 §Fix: resolve the extension-instance channel for this model's
   * raw-send sites — the SAME resolution shape the producer's own sites use
   * (`ProductionThetaProducer#systemNoteChannel`), built over this model's own
   * `pi` / `emitDiagnostic` seams when the composition root wired no channel.
   */
  #resolveSystemNoteChannel(): SystemNoteChannelDeps {
    return (
      this.#systemNoteChannel ?? {
        pi: {
          sendMessage: (message, options): void => {
            this.#pi.sendMessage(message, options);
          },
        },
        emitDiagnostic: this.#emitDiagnostic,
        ui: {
          notify: (): void => {},
        },
      }
    );
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      // Bug 0010 increment C (conversation-drive.md §Provider compatibility):
      // the runtime provider gate refuses BEFORE any provider traffic — no
      // window recording, no `sendUserMessage`, no `complete()`. The loop
      // surfaces the transport Err directly.
      if (this.#respond?.gateError !== undefined) {
        return { kind: "transport", error: this.#respond.gateError };
      }
      // Bug 0010 (PIC-53 window): record the query-window start — the message
      // count immediately before this query's first send — so the off-session
      // respond turn replays exactly THIS query's turns. `??=` (never plain
      // `=`): a respond-repair restart (Increment C) re-enters the two-phase
      // loop at round 0, and the respond window must keep the ORIGINAL query
      // turns — the window start is recorded ONCE per query, never rewound to
      // a follow-up's send position.
      this.#queryWindowStart ??= this.#readMessages().length;
      // SLSH-2: issue the rendered query as one streamed user-visible turn and
      // await its completion so the assistant text is committed before the
      // interpreter resumes. pi runs its NATIVE agentic tool loop for this turn;
      // the governor (STAGE B) bounds it to `tool_loop.max_rounds` by blocking
      // any tool-use round beyond the cap (ceiling #2 / CIO-4) — typed free
      // phases included (bug 0010: the old typed exemption is retired; the
      // forced respond turn is off-session and inherently ungoverned).
      await this.#driveUserVisibleTurn(true);
      this.#freePhaseDriven = true;
      // PIC-50: a synchronous throw from `pi.sendUserMessage` was mapped to a
      // `TransportError` (no turn was issued); surface it as the free-phase
      // transport failure ahead of any exhaustion / text extraction.
      if (this.#transportFromThrow !== undefined) {
        return { kind: "transport", error: this.#transportFromThrow };
      }
      if (this.#exhaustion?.exhausted === true) {
        // The native loop attempted a round beyond `max_rounds`; the governor
        // blocked it. Represent that as a `tool_use` round so the enclosing
        // `runUntypedQueryLoop` reaches its `max_rounds`-final branch and
        // surfaces the canonical `Err(ToolLoopExhaustedError)` with the recorded
        // `last_tool_name` (ERR-19). The native turn already committed its side
        // effects (ERR-13 no-rollback); this batch is not re-executed
        // (`runToolBatch` is a no-op below).
        return this.#exhaustionTurn(this.#exhaustion?.lastToolName);
      }
      // PIC-51/PIC-51b: probe the driven turn's trailing `assistant`
      // `stopReason` before extracting text. `extractPromptModeQueryResult`
      // classifies `stopReason: "error"`, the PIC-51b non-normal-terminator
      // arms (`"length"` → context_overflow, every other non-normal terminator
      // → transport), and the absent-trailing-assistant case; every non-`Ok`
      // verdict except `cancelled` diverts here (cancellation is handled by the
      // enclosing loop's signal guards — bug 0010 F1 / bug 0012 — so it is
      // excluded, not re-classified).
      const probe = extractPromptModeQueryResult(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
      });
      if (!probe.ok && probe.error.kind !== "cancelled") {
        return { kind: "transport", error: probe.error as TransportError | ContextOverflowError };
      }
      // Bug 0415 route (b): an untyped query (`#respond === undefined`) whose
      // native loop consumed all `max_rounds` allowed rounds then terminated
      // with text has spent its budget even though the governor never blocked a
      // round (no round beyond the cap was attempted). CIO-4 pins
      // Err(tool_loop_exhausted) at this boundary for untyped queries; fold to
      // the same synthetic exhaustion round as the over-cap path, discarding the
      // terminating answer, and note the divergence once (typed queries route
      // through the exempt forced-respond terminator and are untouched).
      // PIC-51 cancellation precedence: under abort the enclosing loop's guards
      // surface `cancelled` (no note); the boundary fold and its note must not
      // pre-empt them with a false exhaustion claim.
      if (!this.#thetaAbort.signal.aborted && this.#budgetConsumedWithoutBlock()) {
        this.#emitUntypedBoundaryDiscardNote();
        return this.#exhaustionTurn(this.#exhaustion?.lastAllowedToolName);
      }
      // Completed within the cap: the terminating plain-text turn.
      return { kind: "text", text: extractTrailingTurnText(this.#readMessages()) };
    }
    // Only reachable on the exhausted path: keep returning the synthetic
    // `tool_use` round until `runUntypedQueryLoop`'s slot count reaches
    // `max_rounds` and it surfaces `tool_loop_exhausted`.
    if (this.#exhaustion?.exhausted === true) {
      return this.#exhaustionTurn(this.#exhaustion?.lastToolName);
    }
    // Bug 0415 route (b): the round-0 fold above only fires once; a multi-round
    // boundary drive (`max_rounds > 1`) needs the loop to keep consuming this
    // synthetic round until `slotCount` reaches `max_rounds`, so the same
    // budget-spent predicate is re-checked on every subsequent round.
    if (this.#budgetConsumedWithoutBlock()) {
      return this.#exhaustionTurn(this.#exhaustion?.lastAllowedToolName);
    }
    // Defensive: a non-exhausted round beyond the first is unreachable (round 0
    // returned text) — a terminating turn keeps the loop total.
    return { kind: "text", text: "" };
  }

  /**
   * True when an untyped query's governed round consumed exactly its
   * `max_rounds` budget without any round being blocked — the CIO-4
   * `max_rounds`-final boundary the governor's block-only signal cannot see
   * (bug 0415). Typed queries (`#respond` present) route the boundary through
   * the exempt off-session forced-respond terminator and are excluded here.
   */
  #budgetConsumedWithoutBlock(): boolean {
    return (
      this.#respond === undefined &&
      this.#exhaustion !== undefined &&
      this.#exhaustion.exhausted === false &&
      this.#maxRounds > 0 &&
      this.#exhaustion.slotCount === this.#maxRounds
    );
  }

  /**
   * Emit ONCE the informational divergence note for the bug 0415 boundary
   * fold: the model's terminating answer streamed into the user-visible
   * transcript but is discarded because the round budget was already spent.
   * Bug 0401 law: an informational note carries no `details` key.
   *
   * Bug 0437 §Fix: this note routes through `sendSystemNote` with `details`
   * ABSENT — `SystemNote.details` is now optional so the chain can carry a
   * bug-0401 informational note without fabricating a `details` key.
   */
  #emitUntypedBoundaryDiscardNote(): void {
    sendSystemNote(
      {
        content:
          `theta /${this.#thetaName}: the untyped @-query reached its tool_loop.max_rounds budget ` +
          `(${this.#maxRounds}); the model's terminating answer arrived in an over-budget turn ` +
          "and is discarded \u2014 the query surfaces Err(tool_loop_exhausted) (ceiling #2 / CIO-4).",
        display: true,
      },
      this.#resolveSystemNoteChannel(),
    );
  }

  /**
   * The synthetic single-call `tool_use` round that drives `runUntypedQueryLoop`
   * to its `max_rounds`-final branch on the exhausted path. Its `toolName` is the
   * caller-supplied last tool name (surfaced as ERR-19 `last_tool_name`) — the
   * over-cap path's `lastToolName` or the bug-0415 budget-consumed-without-block
   * boundary's `lastAllowedToolName`; either way a concrete non-null name is
   * expected on this path.
   */
  #exhaustionTurn(toolName: string | null | undefined): FreePhaseTurn {
    if (toolName === undefined || toolName === null) {
      throw new Error(
        "prompt-mode exhaustion turn reached without a recorded last tool name",
      );
    }
    // ERR-19 (queryerror-variants.md:151/:211): the blocked terminal turn's
    // narration is in the same user-session transcript the SUCCESS path reads
    // via `extractTrailingTurnText` (this file) —
    // threading it here satisfies the biconditional instead of hardcoding
    // `raw_response: null` regardless of what the model said.
    //
    // `extractTrailingTurnText` joins the driven turn's `assistant` messages
    // with "\n" (tool-result messages carry role `"toolResult"`, not `"user"`,
    // so the whole multi-round turn is one anchored span). A pure tool-use turn
    // (no narration on any round) therefore collapses to separator-only
    // whitespace, e.g. `["", ""].join("\n") === "\n"` — which must map to null
    // per the biconditional's reservation for text the model never emitted.
    // Genuine narration (any non-whitespace) is surfaced verbatim, untrimmed.
    const text = extractTrailingTurnText(this.#readMessages());
    return {
      kind: "tool_use",
      batch: [{ toolName, toolUseId: "theta-prompt-loop-exhausted" }],
      text: text.trim().length > 0 ? text : null,
    };
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    // pi's native loop executes and commits the real tool calls inside the
    // streamed turn; the theta-level batch (only ever the STAGE-B synthetic
    // exhaustion round) executes nothing.
    return Promise.resolve([]);
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // Bug 0010 increment C: the provider gate short-circuits here too — this
    // covers `max_rounds: 0`, where the loop's free phase is skipped entirely
    // and `forcedRespondTurn` is the FIRST driver call (zero sends, zero
    // completes). At `max_rounds >= 1` the round-0 gate already refused, so
    // this arm is defence-in-depth.
    if (this.#respond?.gateError !== undefined) {
      return { kind: "transport", error: this.#respond.gateError };
    }
    // Bug 0010 (QRY-14 early respond): a payload the model already delivered
    // through a VALID early respond-tool call resolves the query — the
    // off-session forced turn is skipped entirely.
    if (this.#earlyRespond.captured) {
      return { kind: "respond", payload: this.#earlyRespond.payload };
    }
    if (this.#respond === undefined) {
      // DEGRADED arm (bug 0010): the declared annotation did not lower, so no
      // respond tool exists to force. Keep the pre-0010 fused mechanism — one
      // user-visible turn carrying the typed-aware text, its trailing assistant
      // text parsed as the candidate payload — so typed behaviour stays total
      // for unlowerable schemas. A non-JSON reply is surfaced as its raw text
      // (never a thrown `JSON.parse`, never a bound `null`).
      //
      // RESIDUAL DIVERGENCE (bug 0010 fix review, F5 — recorded in the bug
      // doc's Fix §Residuals): `lowerQueryResponseSchema` returns `undefined`
      // ONLY for an empty/whitespace annotation (`@<>` / `@<  >`; every
      // non-empty annotation lowers, permissively for unresolved names, since
      // bug 0004). Since bug 0014 the parser REJECTS that form with
      // theta/parse/empty-query-annotation, so the arm is unreachable from
      // parsed source and survives only as seam-level totality over the
      // lowering's `undefined` contract. On that arm the ENTIRE pre-0010
      // fused mechanism survives:
      // user-visible JSON-in-text turn, `maxRounds: 0` collapse, ungoverned
      // native loop, no respond tool, no provider gate, and — because no
      // lowered schema exists — NO schema-validation collaborator, so the
      // parsed payload binds UNVALIDATED (the CIO-3 depth walk still runs in
      // the loop; AJV does not). Pinned by the degraded-arm cells in
      // tests/typed-two-phase-live.test.ts / tests/off-session-two-phase.test.ts.
      await this.#driveUserVisibleTurn(false);
      // PIC-50/51/51b: a transport failure on the fused turn (send sync-throw,
      // trailing `stopReason: "error"`, a PIC-51b non-normal terminator, or an
      // absent-trailing-assistant settled turn) surfaces as the typed query's
      // `Err(TransportError | ContextOverflowError)` rather than being parsed as
      // a structured payload.
      if (this.#transportFromThrow !== undefined) {
        return { kind: "transport", error: this.#transportFromThrow };
      }
      const probe = extractPromptModeQueryResult(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
      });
      if (!probe.ok && probe.error.kind !== "cancelled") {
        return { kind: "transport", error: probe.error as TransportError | ContextOverflowError };
      }
      const text = extractTrailingTurnText(this.#readMessages());
      const parse = parseStructuredPayload(text);
      return { kind: "respond", payload: payloadForRespond(parse) };
    }
    // Bug 0010 (QRY-14 step 2 / SLSH-2): the forced respond turn dispatches
    // OFF-SESSION through pi-ai `complete()` — no `pi.sendUserMessage`, no
    // session turn, no transcript card. The conversation is the driven query
    // window (PIC-53 read surface, opened at the query's first send) with the
    // QRY-15 template as the trailing user message; at the `max_rounds: 0`
    // boundary (no free-phase turn was issued) it is a SINGLE user message —
    // the rendered prompt right-trimmed of trailing newlines, one U+000A, and
    // the QRY-15 template body (QRY-14 step 2 boundary).
    if (this.#freePhaseDriven) {
      return this.#dispatchRespondOverWindow(this.#respond);
    }
    return dispatchForcedRespondTurn(this.#respond, [
      {
        role: "user",
        content: this.#queryText.replace(/\n+$/, "") + "\n" + this.#respond.template,
        timestamp: 0,
      },
    ]);
  }

  /**
   * Bug 0010 increment C (QRY-14 ¶3): drive ONE respond-repair attempt as a
   * FULL TWO-PHASE RESTART — the QRY-12 follow-up template opens a restarted
   * ON-SESSION free phase (respond tool active in the PIC-17 install vector,
   * early-respond capture RE-ARMED, governor RE-ARMED with a fresh
   * `max_rounds` budget per QRY-16), terminated by a FRESH off-session forced
   * respond dispatch over the query window (which now includes the follow-up
   * turn) with the QRY-15 trailing template. At the `max_rounds: 0` boundary
   * no on-session turn is issued and the fresh dispatch's SINGLE user message
   * is the QRY-12 follow-up text ALONE (it already carries the instruction +
   * schema — QRY-15 is never concatenated after it, and no prompt fusion
   * applies).
   *
   * Result mapping for the widened `driveFollowUp` seam: a transport failure
   * anywhere in the attempt → `provider_failure` (the proximate error
   * terminates repair with no attempts debit — QRY-11 §non-validation / bug
   * 0007); an early-captured or extracted payload → `respond_outcome.payload`
   * (AJV-validated caller-side); an ERR-17 report →
   * `respond_outcome.noncompliance` (one debit, the synthesised issue drives
   * the next follow-up's <ajv-summary>).
   */
  async driveRepairAttempt(
    prompt: string,
  ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> {
    const respond = this.#respond;
    if (respond === undefined) {
      // Unreachable by construction: `#resolvePromptQuery` wires this drive
      // only when the respond context exists. Kept total rather than throwing
      // across the seam.
      return {
        kind: "provider_failure",
        error: {
          kind: "transport",
          message: "no respond-turn machinery for the typed-query repair attempt",
          http_status: null,
          provider: this.#provider,
          retryable: false,
        },
      };
    }
    // Defensive gate re-check (bug 0010 increment C): the round-0 /
    // forcedRespondTurn gates already refused before any repair could open, so
    // a gated context can never reach here through the loop — but the refusal
    // stays total on this entry point too.
    if (respond.gateError !== undefined) {
      return { kind: "provider_failure", error: respond.gateError };
    }
    // Reset the per-attempt early-respond snapshot BEFORE the restarted phase:
    // the capture slot is re-armed per driven turn inside
    // `#driveUserVisibleTurn` (it arms whenever `#respond` is present), and the
    // snapshot must reflect THIS attempt's turn — never a stale earlier phase
    // (a captured earlier phase already resolved its own query/attempt, so a
    // stale `captured: true` here could only mis-resolve the attempt).
    this.#earlyRespond = { captured: false };
    // Same hygiene for the sync-throw slot: a set value would have terminated
    // the query (transport) before repair opened, so it is always undefined
    // here — reset keeps the invariant local to the attempt.
    this.#transportFromThrow = undefined;
    if (this.#maxRounds > 0) {
      return this.#driveRestartedRepairPhase(respond, prompt);
    }
    // `max_rounds: 0` (QRY-14 step 2 boundary applied to the restarted loop):
    // NO on-session turn; the fresh dispatch's SINGLE user message is the
    // QRY-12 follow-up text ALONE — the template already carries the
    // instruction + schema, so the QRY-15 template is NOT concatenated after
    // it and the initial turn's prompt fusion does not apply.
    //
    // Boundary abort check (the r7 discipline, bug 0010 fix review F1): an
    // abort observed at this repair boundary terminates the attempt as the
    // CancelledError — QRY-11 §non-validation, no attempts debit — and issues
    // NO post-abort dispatch (the dispatch-level gate would refuse anyway,
    // but its transport shape would mis-surface the cancellation as a
    // transport failure at this seam).
    if (this.#thetaAbort.signal.aborted) {
      return { kind: "provider_failure", error: makeCancelledError() };
    }
    return mapForcedTurnToRepairOutcome(
      await dispatchForcedRespondTurn(respond, [
        { role: "user", content: prompt, timestamp: 0 },
      ]),
      this.#thetaAbort.signal,
      // The `max_rounds: 0` boundary ran no restarted free phase (0 slots).
      0,
    );
  }

  /** Drive the restarted free phase and its fresh respond dispatch (QRY-14 ¶3). */
  async #driveRestartedRepairPhase(
    respond: RespondTurnContext,
    prompt: string,
  ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> {
    // The restarted free phase: ONE bounded streamed turn opening with the
    // QRY-12 follow-up as its user message. `#driveUserVisibleTurn(true, …)`
    // re-arms the governor via `begin(this.#maxRounds)` — the FRESH
    // per-follow-up `tool_loop` budget QRY-16 pins — and re-arms the
    // early-respond capture slot around the turn.
    await this.#driveUserVisibleTurn(true, prompt);
    if (this.#transportFromThrow !== undefined) {
      // PIC-50: a `sendUserMessage` sync-throw is the attempt's proximate
      // transport failure — no attempts debit (QRY-11 §non-validation).
      return { kind: "provider_failure", error: this.#transportFromThrow };
    }
    // PIC-51 / QRY-11 (bug 0010 fix review C, finding 1): the post-turn
    // probe diverts on EVERY failure verdict. An error-stop on the streamed
    // follow-up turn is the attempt's proximate transport failure; a
    // cancellation observed after the turn settled (the probe's aborted arm
    // synthesises `Err(cancelled)`) terminates repair as its own
    // non-validation failure (query-failure-and-repair.md §Non-validation:
    // `cancelled` is enumerated; the propagated error resolves to the CANCEL
    // terminal outcome downstream, error-model.md §Terminal outcomes).
    // Neither verdict is text-parsed, and neither falls through to the
    // fresh off-session dispatch — an aborted attempt issues NO post-abort
    // provider call.
    const probe = extractPromptModeQueryResult(this.#readMessages(), {
      aborted: this.#thetaAbort.signal.aborted,
      provider: this.#provider,
    });
    if (!probe.ok) {
      return { kind: "provider_failure", error: probe.error };
    }
    // PIC-1 (d) / bug 0355: this restarted free phase's OWN slot count — the
    // governor's `roundsAllowed`, read from the exhaustion snapshot
    // `#driveUserVisibleTurn` just set. It masks a terminal event raised on
    // this follow-up against the follow-up's fresh budget, never the parent's.
    const followUpSlots = this.#exhaustion?.slotCount ?? 0;
    // QRY-14 ¶3: a valid mid-turn respond-tool call during the RESTARTED
    // free phase resolves the attempt — the fresh off-session dispatch is
    // skipped exactly as the original phase's early capture skips its
    // initial respond turn.
    if (this.#earlyRespond.captured) {
      return {
        kind: "respond_outcome",
        slotCountAtDispatch: followUpSlots,
        turn: { kind: "payload", payload: this.#earlyRespond.payload },
      };
    }
    // WHY no exhaustion branch (CIO-4 `max_rounds`-final on the restart): a
    // repair turn that exhausts its FRESH budget is not the loop's free
    // phase — there is no slot accounting to feed a synthetic `tool_use`
    // round into, and a typed query never surfaces `tool_loop_exhausted`
    // (QRY-16: the exempt terminator). The exhausted restart falls through
    // to the fresh forced respond dispatch, exactly as the original phase's
    // exhaustion falls to its `max_rounds`-final respond turn.
    return mapForcedTurnToRepairOutcome(
      await this.#dispatchRespondOverWindow(respond),
      this.#thetaAbort.signal,
      followUpSlots,
    );
  }

  /**
   * Bug 0010 (QRY-14 step 2): the window-shaped forced respond dispatch — the
   * driven query window (PIC-53 read surface, opened at the query's first
   * send and never rewound) plus the trailing QRY-15 template user message.
   * Shared by the initial `forcedRespondTurn` and each repair attempt's fresh
   * dispatch (`driveRepairAttempt`), so both re-enter the SAME forced-respond
   * mechanism byte-identically.
   */
  #dispatchRespondOverWindow(respond: RespondTurnContext): Promise<ForcedRespondTurn> {
    const messages: Message[] = [
      ...this.#readMessages().slice(this.#queryWindowStart ?? 0),
      { role: "user", content: respond.template, timestamp: 0 },
    ];
    return dispatchForcedRespondTurn(respond, messages);
  }

  /**
   * Issue one streamed user-visible turn and await its full completion.
   *
   * `pi.sendUserMessage` is fire-and-forget: it schedules a fresh agent run but
   * returns before that run installs its active-run handle, and
   * `ctx.waitForIdle()` resolves immediately while no run is active. So the
   * driver first waits for the run to become observably non-idle (bounded, on
   * the injected `Clock` macrotask queue, so a turn that never starts cannot
   * hang), then awaits idle for the run's `agent_end`.
   *
   * `text` defaults to the query's opening prompt; a respond-repair restart
   * (Increment C) passes the follow-up template instead.
   */
  async #driveUserVisibleTurn(bound: boolean, text: string = this.#queryText): Promise<void> {
    // Bug 0288 §Fix item 1: the pre-send gate. `pi.sendUserMessage` is
    // fire-and-forget, and a send issued while the host reports streaming is
    // rejected ASYNCHRONOUSLY into the host's extension-error channel
    // (agent-session.js:1858) — unobservable to this driver (bug doc P3). Wait,
    // bounded, until the session is idle, so the send below can only ever land
    // on a session with nothing in flight — this removes the swallowed-send
    // candidate BY CONSTRUCTION rather than by detecting it after the fact.
    // Expiry fails loudly and issues NO send.
    //
    // The gate keys on `ctx.isIdle()` ALONE — the in-flight signal §Fix item 1
    // actually needs — and deliberately makes no demand on the settledness of
    // whatever slice precedes this turn. The message list is the USER's whole
    // long-lived conversation, not this drive's window: a turn the user
    // cancelled before any assistant entry existed is idle but never
    // settleable, so a settledness demand would stall a benign single-query
    // drive for the full bound and then fail it where the reply was available
    // (§Non-goals: single-query drives keep their observable behaviour). It
    // would also buy nothing — every turn THIS drive issued is already settled
    // by the per-turn settle-poll below before `#driveUserVisibleTurn`
    // returns, which is what sequences query N+1 after query N.
    const gateCleared = await this.#pollWhile(() => !this.#ctx.isIdle(), PRE_SEND_GATE_POLL_BOUND);
    if (!gateCleared) {
      this.#recordLifecycleExpiry("pre-send-gate", PRE_SEND_GATE_POLL_BOUND * POLL_INTERVAL_MS);
      return;
    }
    // Bug 0479 (frontmatter `model`): a PRESENT `model:` that no longer resolves
    // in the registry at dispatch is a refusal before any turn — the load pass
    // admitted the reference, so this is a registry change since — never a
    // silent run on the session model. Same posture as the respond dispatch's
    // model-unavailable `Err`.
    if (this.#queryModelRef !== undefined && this.#queryModel === undefined) {
      // The fixed sentinel provider: no model drove (or could drive) the turn,
      // exactly the respond dispatch's model-unavailable posture.
      this.#transportFromThrow = {
        kind: "transport",
        message: `no resolved model for the query turn: theta 'model:' value '${this.#queryModelRef}' resolves to no available model`,
        http_status: null,
        provider: "unknown",
        retryable: false,
      };
      return;
    }
    // STAGE B: when `bound`, arm the governor around the native turn so pi's
    // internal agentic tool loop is capped at `tool_loop.max_rounds`. The bound
    // is armed IMMEDIATELY before `sendUserMessage` and disarmed right after the
    // turn settles, so it never affects unrelated turns or other queries. The
    // exhaustion snapshot is read by `nextFreePhaseTurn` after this resolves.
    // Bug 0010: typed free-phase turns are bound too (CIO-4); only the degraded
    // fused arm passes `bound: false`.
    if (bound) {
      this.#governor.begin(this.#maxRounds);
    }
    // PIC-17 active-set gating (QTL-4 / bug 0010): install exactly
    // `[...thetaCallableSetNames, respondToolName?]` — the theta's callable-set
    // underlying Pi-tool names plus, on a typed query, the synthesised respond
    // tool — as the model's active tools for the query turn, restoring the
    // ambient snapshot in the gate's `finally`. Ambient tools are deliberately
    // not inherited (a theta with no Pi tools installs `[respondTool?]`).
    const install: CallableSetInstall = {
      thetaCallableSetNames: this.#activeTools,
      ...(this.#respond !== undefined ? { respondToolName: this.#respond.toolName } : {}),
    };
    // Bug 0288 §Fix item 3/4: the message-list length recorded BEFORE this
    // send — the boundary this turn's OWN user entry must land at or after. A
    // settled-slice read that ignored this boundary could still anchor on an
    // EARLIER turn's (already-settled) user entry and silently re-extract its
    // text (P2's exact failure shape) instead of failing loudly over this
    // turn's own, still-unattributed one.
    const turnStart = this.#readMessages().length;
    // Bug 0319 (cancellation.md §"Forwarding into `thetaAbort`", bidirectional
    // prompt-mode clause): the reverse bridge. `gateCleared` above already
    // established `ctx.isIdle()`, so from here a turn is genuinely being
    // driven -- attaching only for this window is the in-flight-only scoping
    // the clause requires (an idle-time thetaAbort must never tear down an
    // unrelated user run). Calls the RAW, Pi-supplied `ctx.abort()` -- never
    // the synthesised tool-execution wrapper, whose body re-enters
    // `thetaAbort.abort()` (cancellation.md §"Forwarding into `thetaAbort`";
    // conversation-drive.md §"Hang handling").
    const onThetaAbortTeardown = (): void => {
      if (this.#promptCancelPropagated) {
        return;
      }
      this.#promptCancelPropagated = true;
      try {
        this.#ctx.abort(); // unwrapped, Pi-supplied -- tears the user run down, unblocks waitForIdle
      } catch (thrown: unknown) { // allow-broad-catch: theta/runtime/internal-error -- cancellation.md §Forwarding-listener throw
        // Trap at the listener boundary: a throw inside an AbortSignal "abort"
        // listener is otherwise reported out-of-band (Node uncaughtException). The
        // cancellation already took effect (thetaAbort fired to reach this listener),
        // so trapping the defect does NOT swallow the cancellation -- the drive's own
        // #pollWhile gates still settle Err(cancelled). (cancellation.md §Forwarding-
        // listener throw: "The trap MUST NOT swallow the cancellation itself".)
        void thrown;
      }
    };
    const teardownSignal = this.#thetaAbort.signal;
    if (!teardownSignal.aborted) {
      teardownSignal.addEventListener("abort", onThetaAbortTeardown, { once: true });
    }
    // Bug 0372 §Fix: the compliant PIC-8/PIC-19 gate. A restore throw gets a
    // single re-attempt, then `active-set-restore-failed` (E) + the display
    // note, and the completed query's outcome propagates unmasked; a
    // step-1/step-2 setup throw routes to `theta/runtime/internal-error`.
    const activeSetGateDeps: ActiveSetGateDeps = {
      pi: this.#pi,
      thetaName: this.#thetaName,
      installVector: computeActiveSetInstall(install),
      emitDiagnostic: this.#emitDiagnostic,
      emitSystemNote: (note): void => {
        sendSystemNote(note, this.#resolveSystemNoteChannel());
      },
      // PIC-19: a step-1/step-2 setup throw re-propagates out of
      // `withActiveSetGate` (it calls this hook THEN re-throws) into this
      // method's own `try`, which has no local catch — the throw unwinds to
      // the top-level slash-dispatch outer catch, the authoritative single
      // owner of `theta/runtime/internal-error` for the producer path. This
      // hook stays a no-op so the defect is routed exactly once, never twice.
      routeInternalError: (): void => {},
    };
    // PIC-17 model window (tool-registration-lifetime.md #pic-17-model-window,
    // bug 0479): a prompt-mode turn is a turn of the shared user session, whose
    // model drives it — so a present `model:` is swapped in for exactly this
    // turn and the session's own model restored in the window's `finally`
    // (PIC-8-model single re-attempt, then `theta/runtime/model-restore-failed`
    // + the display note). Inert (no `pi.setModel` call) when `model:` is absent
    // or equals the session model — which is every subagent child, whose session
    // already runs the marshalled theta model. The step-1a snapshot reads the
    // session's CURRENT model at each turn.
    const modelWindowDeps: ModelWindowDeps<Model<Api>> = {
      pi: this.#pi,
      thetaName: this.#thetaName,
      ambient: this.#ctx.model,
      target: this.#queryModel,
      emitDiagnostic: this.#emitDiagnostic,
      emitSystemNote: (note): void => {
        sendSystemNote(note, this.#resolveSystemNoteChannel());
      },
    };
    try {
      const window = await withActiveSetGate(activeSetGateDeps, () => withModelWindow(modelWindowDeps, async () => {
        // Bug 0010 (QRY-14 early respond): arm the producer's one-shot capture
        // slot for the duration of the driven turn, so a mid-turn respond-tool
        // call validates and captures against THIS query's lowered schema. The
        // slot is cleared — and the captured payload snapshotted — in the
        // `finally`, even on an error/abort path.
        const capture: ActiveRespondCapture | undefined =
          this.#respond !== undefined
            ? { toolName: this.#respond.toolName, validate: this.#respond.validate, captured: false }
            : undefined;
        if (capture !== undefined) {
          this.#respond?.captureHost.setActiveCapture(capture);
        }
        try {
          // PIC-50: `pi.sendUserMessage` is the only failure the call surface itself
          // can signal synchronously. Map such a throw to a `TransportError` (never
          // `theta/runtime/internal-error`, never a swallowed `Ok("")`) and return
          // without issuing a turn; the driver surfaces it as the query's transport
          // `Err`. The gate's `finally` still restores the ambient active set.
          // Bug 0414 (conversation-drive.md:16 PIC-70): an abort observed inside
          // the pre-send-gate window must short-circuit the send. `#pollWhile`
          // exits on the aborted signal but returns the SESSION idle-state, so an
          // Esc burst that both idles the ambient run and aborts `thetaAbort`
          // clears the gate; without this guard the straight-line path issues a
          // post-cancel user-visible turn that is never torn down (the bug-0319
          // teardown listener refuses to attach on an already-aborted signal).
          // The PIC-51 probe's cancelled short-circuit already answers
          // `Err(cancelled)`; mirrors `driveRepairAttempt`'s boundary abort check.
          if (this.#thetaAbort.signal.aborted) {
            return;
          }
          try {
            this.#pi.sendUserMessage(text);
          } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — PIC-50 sendUserMessage sync-throw → TransportError
            this.#transportFromThrow = mapPromptModeSyncThrow(thrown, this.#provider);
            return;
          }
          // Bug 0288 §Fix item 3: start-poll. Poll while the run has not been
          // observed non-idle AND this turn's OWN slice has not yet settled — a
          // turn that starts and finishes inside one poll interval (the guard
          // cell, `tests/b0288-prompt-turn-completion-witness.test.ts` (v)) settles
          // the second way and must not be mistaken for one that never started.
          // Only an expiry with the slice still UNSETTLED is the loud failure
          // (P1/P4: `isIdle` is not a proxy for "the send took effect").
          const startCleared = await this.#pollWhile(
            () =>
              this.#ctx.isIdle() &&
              !thisTurnSettled(this.#readMessages(), turnStart, this.#readContextPath()),
            TURN_START_POLL_BOUND,
          );
          if (!startCleared) {
            this.#recordLifecycleExpiry("start", TURN_START_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // CANCEL-2 (cancellation.md §Forwarding into `thetaAbort`, slash-command
          // entry): once the start poll has cleared, `ctx.signal` reflects THIS
          // turn whenever the host observed it streaming (it is `undefined` at
          // idle slash-entry, and a no-op forward below when the fast path never
          // observed the run non-idle at all). Re-forward it INTO `thetaAbort` so
          // an Esc during the `@`-query turn flips the single source of truth
          // every checkpoint gates on — the end-to-end "Esc during `@`-query" path.
          // Idempotent: the one-shot guard on `thetaAbort.abort()` makes a repeat
          // forward a no-op, and the listener is `{ once: true }` on the per-turn
          // transient `ctx.signal`, so no long-lived controller leaks. Decision 6 /
          // Increment B2: this PER-TURN forward's detach is deliberately NOT
          // collected onto the shared `forwardingSignals` sink — the listener sits
          // on a per-turn-transient `ctx.signal` that self-cleans (`{once:true}` and
          // GC'd with the turn), so collecting it would add per-turn push/splice
          // churn for no shutdown-lifetime benefit. Only the invocation-scoped bind
          // forwards are collected (sub-step 5 detaches those).
          forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal);
          if (this.#ctx.isIdle()) {
            // Bug 0288 §Fix item 3, the fast path: the turn's own slice settled
            // without `isIdle()` ever being observed false. Nothing to wait out.
            return;
          }
          // Bug 0288 §Fix item 4: bounded end-poll, then a bounded `waitForIdle`
          // race, then a bounded wait for THIS turn's own slice to settle. Each
          // expiry is the query's loud `Err` — no ≈600s walk-out (P6), no
          // unbounded `waitForIdle` (P5: `_isAgentRunActive` clears before the
          // `agent_settled` emit is awaited, so a flag-based wait alone is not a
          // turn-completion signal).
          const endCleared = await this.#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND);
          if (!endCleared) {
            this.#recordLifecycleExpiry("settle", TURN_END_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // Race `ctx.waitForIdle()` against a `Clock`-driven bound instead of
          // awaiting it unboundedly (§Fix item 4 / D5). Both branches carry an
          // identical single `.then()` hop so a tie (both already resolved, the
          // common fixture shape) resolves in `waitForIdle`'s favour — the branch
          // listed first — rather than being decided by incidental extra
          // microtask hops.
          //
          // The losing leg's timer is CLEARED after the race (the house pattern
          // at factory.ts's `quiesceOutgoingRebuild` and
          // runtime/subagent-isolation.ts's bounded exit await): on the common
          // path `waitForIdle()` wins, and an uncleared handle would hold the
          // event loop open for the bound on every driven turn.
          let idleSettled = false;
          let idleBoundTimer: TimerHandle | undefined;
          const idleBound = new Promise<void>((resolve) => {
            idleBoundTimer = this.#clock.setTimeout(() => resolve(), WAIT_FOR_IDLE_BOUND_MS);
          });
          // Bug 0319 (PIC-70 stop-promptly): a third race leg so an abort landing
          // in this window resolves the race immediately rather than sitting out
          // `WAIT_FOR_IDLE_BOUND_MS` -- belt-and-braces alongside the teardown
          // listener above, since that listener's `ctx.abort()` unblocking
          // `waitForIdle()` is unpinned Pi-side behaviour, not a guarantee. Leaves
          // `idleSettled` false, so control falls to the settle-phase expiry check
          // below, which already no-ops on an aborted `thetaAbort` (compensating
          // gate) rather than minting a transport Err.
          let onSettleAbort: (() => void) | undefined;
          const settleAbort = new Promise<void>((resolve) => {
            if (this.#thetaAbort.signal.aborted) {
              resolve();
              return;
            }
            onSettleAbort = (): void => resolve();
            this.#thetaAbort.signal.addEventListener("abort", onSettleAbort, { once: true });
          });
          try {
            await Promise.race([ // allow: cka-62 — pi-integration-contract/conversation-drive.md
              this.#ctx.waitForIdle().then(() => {
                idleSettled = true;
              }),
              idleBound.then(() => {}),
              settleAbort,
            ]);
          } finally {
            if (idleBoundTimer !== undefined) {
              this.#clock.clearTimeout(idleBoundTimer);
            }
            if (onSettleAbort !== undefined) {
              this.#thetaAbort.signal.removeEventListener("abort", onSettleAbort);
            }
          }
          if (!idleSettled) {
            this.#recordLifecycleExpiry("settle", WAIT_FOR_IDLE_BOUND_MS);
            return;
          }
          const settleCleared = await this.#pollWhile(
            () => !thisTurnSettled(this.#readMessages(), turnStart, this.#readContextPath()),
            TURN_SETTLE_POLL_BOUND,
          );
          if (!settleCleared) {
            this.#recordLifecycleExpiry("settle", TURN_SETTLE_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // CANCEL-2 (agent_end user-cancel trigger, CNCL-4 synthesised reason): a
          // turn that ended aborted without a forwarded source reason flips
          // `thetaAbort` with the synthesised `"theta cancelled by agent_end"` reason,
          // so the next checkpoint observes the cancellation.
          if (this.#ctx.signal?.aborted === true && !this.#thetaAbort.signal.aborted) {
            abortForAgentEnd(this.#thetaAbort);
          }
        } finally {
          if (capture !== undefined) {
            this.#respond?.captureHost.clearActiveCapture();
            if (capture.captured) {
              this.#earlyRespond = { captured: true, payload: capture.payload };
            }
          }
        }
      }));
      // The host declined the swap-in (`pi.setModel` resolved `false`:
      // authentication is not configured for the pinned model's provider): no
      // turn was issued, so the query is a transport `Err` naming the model —
      // never a run on the session model the author steered away from.
      if (window.kind === "refused") {
        this.#transportFromThrow = {
          kind: "transport",
          message: `theta 'model:' value '${window.target.provider}/${window.target.id}' could not be selected for the query turn: the host declined pi.setModel (authentication not configured for provider '${window.target.provider}'); the turn was not issued`,
          http_status: null,
          provider: this.#provider,
          retryable: false,
        };
      }
    } finally {
      // Bug 0319: detach first so every exit path -- including the throws the
      // gating callback body can raise -- leaves no listener attached beyond
      // this turn's own window (structural in-flight-only scoping).
      teardownSignal.removeEventListener("abort", onThetaAbortTeardown);
      // STAGE B: disarm the governor and capture the exhaustion snapshot the
      // moment the turn settles, even on an error/abort path.
      if (bound) {
        this.#exhaustion = this.#governor.end();
      }
    }
  }

  /**
   * Release the event loop, polling `condition` on the `Clock` up to `bound`
   * times. Returns whether the condition CLEARED (observed false at or before
   * the bound) as opposed to the bound EXPIRING while it was still true (bug
   * 0288 §Fix item 1 / P1) — the caller can no longer mistake one for the
   * other, which is the root cause this bug fixes: at HEAD both exits
   * returned identically and a caller could not tell "satisfied" from
   * "expired".
   */
  async #pollWhile(condition: () => boolean, bound: number): Promise<boolean> {
    for (let i = 0; i < bound && condition() && !this.#thetaAbort.signal.aborted; i += 1) {
      await macrotask(this.#clock, POLL_INTERVAL_MS);
    }
    return !condition();
  }

  /**
   * Record a bounded turn-lifecycle wait's expiry as this query's transport
   * `Err` — UNLESS the theta has been cancelled. PIC-51 pins that an observed
   * `thetaAbort.signal.aborted` synthesises `Err(cancelled)` INSTEAD of reading
   * session error state, and that precedence is honoured only by
   * `extractPromptModeQueryResult`, which every caller skips once
   * `#transportFromThrow` is set. Leaving it unset on an aborted drive keeps
   * Esc-before-the-first-token answering `Err(cancelled)` promptly, exactly as
   * the PIC-51 probe already did.
   */
  #recordLifecycleExpiry(phase: PromptModeTurnLifecyclePhase, boundMs: number): void {
    if (this.#thetaAbort.signal.aborted) {
      return;
    }
    this.#transportFromThrow = mapPromptModeTurnLifecycleExpiry(
      phase,
      boundMs,
      this.#provider,
    );
  }
}

/** Poll cadence (ms) while waiting for a fire-and-forget user turn's stream lifecycle. */
const POLL_INTERVAL_MS = 10;

/**
 * Bound on the pre-send gate (§Fix item 1): waiting for the session to report
 * no run in flight before this query's own send is issued.
 */
const PRE_SEND_GATE_POLL_BOUND = 1000;

/** Bound on start-phase polls (≈ waiting for the run to begin streaming). */
const TURN_START_POLL_BOUND = 1000;

/**
 * Bound on end-phase polls (≈ waiting for the streamed run to go idle again).
 * Bug 0288 §Fix item 4 reduced this to 6000 polls (60 s) for diagnosability;
 * bug 0464 raised it back out: a legitimate on-session turn's tool loop — a
 * reviewer reading a file set, a fixer running a full offline test suite —
 * runs for many minutes, and a 60 s total bound failed every such turn by
 * construction (`transport` expiry while the run was still healthily
 * streaming). 180000 polls × 10 ms = 30 min. Test diagnosability is
 * unaffected: the witness harnesses drive `#pollWhile` on an injected fake
 * `Clock`, so wall time does not scale with the bound. The known follow-up
 * (recorded in bug 0464) is an inactivity-reset bound — budget renewed on
 * observed turn progress — instead of one fixed total.
 */
const TURN_END_POLL_BOUND = 180000;

/**
 * The settle-phase bound in milliseconds, exported for the bug-0464 witness:
 * a regression back to a test-scale total bound must red loudly, because it
 * kills every legitimately long tool-loop turn in production.
 */
export const TURN_END_SETTLE_BOUND_MS = TURN_END_POLL_BOUND * POLL_INTERVAL_MS;

/**
 * Bound (ms) on the `ctx.waitForIdle()` race (§Fix item 4 / D5): replaces the
 * unbounded await at HEAD (P5/P6) with a `Clock`-driven race so a settle path
 * that never resolves the flag presents as a loud named expiry.
 */
const WAIT_FOR_IDLE_BOUND_MS = 2000;

/**
 * Bound on the final settle-poll (§Fix item 4): waiting for THIS turn's own
 * message-list slice to read as settled once the idle-flag wait has cleared.
 */
const TURN_SETTLE_POLL_BOUND = 1000;

/** Release the event loop for one poll interval through the injected `Clock` seam. */
function macrotask(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}

// --- Bug 0288 §Fix items 1/3/4 — the settled-turn predicate, producer-side ---
//
// D4 (adjudicated in-lane): implemented over the producer's OWN built
// `Message[]` read surface (`#readMessages()`), not factored into
// `src/runtime/` for sharing with `tests/live/harness.ts`. The harness reads
// raw `SessionManager` entries (`classifyLastTurn`/`captureSettledTurn`
// since bug 0289's fix, 0.286.0); this reads built `Message[]` — the two
// surfaces differ, so this is an independent implementation of the same
// idea, not a shared function.

/**
 * Whether the slice AFTER a turn's own `user`-role message is a SETTLED
 * ending. Two disjoint arms:
 *
 *   1. A trailing `assistant` message exists — whatever its `stopReason`, with
 *      or without text. PIC-51b pins the whole trailing-`assistant` set as
 *      DEFINITE outcomes: `"error"` and the non-normal terminators classify
 *      as `transport`, `"length"` as `context_overflow`, and an EMPTY-TEXT
 *      assistant on a normal boundary reaches PIC-53's `Ok("")` (the pure
 *      tool-use turn). Narrowing this arm to "non-empty text, or `stopReason`
 *      `"error"`/`"aborted"`" would read those definite outcomes as an
 *      in-flight turn, mint a lifecycle `TransportError` where PIC-51b
 *      mandates a different classification, and never let the turn settle.
 *      Settledness is only ever consulted once the run has been observed
 *      IDLE, so no message can still be accruing when this arm fires.
 *      Classification itself stays with `extractPromptModeQueryResult`, the
 *      single implementation of the PIC-51 / PIC-51b / PIC-53 ordering — this
 *      predicate decides only "the turn is over", never "what it means".
 *   2. A tool-result-only ending: the slice's last message is a
 *      `ToolResultMessage` with nothing generated after it — a tool round the
 *      host committed with no assistant entry of its own yet.
 */
function isSettledTurnEnding(afterUser: readonly Message[]): boolean {
  for (let i = afterUser.length - 1; i >= 0; i -= 1) {
    if (afterUser[i]?.role === "assistant") {
      return true;
    }
  }
  const last = afterUser[afterUser.length - 1];
  return last !== undefined && last.role === "toolResult";
}

/**
 * Locate the slice after the LAST `user`-role message at or after
 * `fromIndex` in `messages` (bug 0288 §Fix item 1/3/4). `fromIndex` bounds the
 * search to a particular turn's own send: a `user` entry recorded BEFORE it
 * belongs to an earlier, already-settled turn and must never be mistaken for
 * this turn's own anchor — the exact silent failure P2 describes
 * (`extractTrailingTurnText` anchoring on the wrong turn's `user` entry).
 */
function turnSliceSince(
  messages: readonly Message[],
  fromIndex: number,
): { readonly opened: boolean; readonly after: readonly Message[] } {
  for (let i = messages.length - 1; i >= fromIndex; i -= 1) {
    if (messages[i]?.role === "user") {
      return { opened: true, after: messages.slice(i + 1) };
    }
  }
  return { opened: false, after: [] };
}

/**
 * Whether THIS turn — the one whose own `pi.sendUserMessage` was issued when
 * `#readMessages().length` was `turnStart` — has settled. Requires the turn's
 * OWN `user` entry to exist at or after `turnStart`: an inert/swallowed send
 * (bug doc P3: the `isStreaming`-without-`streamingBehavior` throw appends NO
 * user entry) can never read as settled no matter what the rest of the
 * transcript looks like.
 */
function thisTurnSettled(
  messages: readonly Message[],
  turnStart: number,
  path: readonly SessionEntry[],
): boolean {
  const slice = turnSliceSince(messages, turnStart);
  return slice.opened && isSettledTurnEnding(slice.after) && !trailingCompactionUnanswered(path);
}

/**
 * Bug 0482 (conversation-drive.md PIC-70): whether the chronological leaf
 * path ends in a `compaction` entry with NO assistant reply (or settling
 * `toolResult`) after it. Auto-compaction is transparent to the conversation
 * (`docs/compaction.md` in the pi package) — a trailing, unanswered
 * compaction means the turn is still in flight, so the drive must wait
 * through it; PIC-70's settle-phase expiry is the loud backstop when no
 * reply ever follows.
 */
function trailingCompactionUnanswered(path: readonly SessionEntry[]): boolean {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const entry = path[i];
    if (entry === undefined) {
      continue;
    }
    if (entry.type === "compaction") {
      return true;
    }
    if (entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")) {
      return false;
    }
  }
  return false;
}

/**
 * Bug 0010 increment C: map one fresh forced respond dispatch's seam result to
 * the widened `driveFollowUp` repair-drive result — an extracted payload and
 * an ERR-17 report both ride `respond_outcome` (validated / debited by the
 * repair loop caller-side), a transport failure rides `provider_failure` (the
 * proximate error terminates repair with no attempts debit, QRY-11
 * §non-validation / bug 0007).
 *
 * `signal` is the THETA abort signal (bug 0010 fix round 2, R2-1): an abort
 * landing while the fresh dispatch is in flight resolves through pi-ai as an
 * aborted-stop reply and reaches this seam on the transport arm with the fixed
 * "cancelled" message — with the theta signal aborted that is the
 * cancellation, surfaced as `provider_failure: CancelledError` (QRY-11
 * §non-validation: `cancelled` terminates repair with no debit; the propagated
 * error resolves to the CANCEL terminal outcome downstream). The exact mirror
 * of the loop's forced-respond guard (query-tool-loop.ts `runTypedQueryLoop`,
 * signal-aborted transport → cancelled) applied to the repair-side dispatch. A
 * transport verdict with a NON-aborted signal stays transport.
 *
 * `slotCountAtDispatch` is the follow-up's OWN fresh `tool_loop` slot count at
 * this dispatch (post-increment: the restarted free phase's rounds, capped at
 * `max_rounds`; 0 at the `max_rounds: 0` boundary). PIC-1 (d) / bug 0355: a
 * terminal event raised on this attempt masks against THIS scalar, not the
 * parent query's exhausted budget.
 */
function mapForcedTurnToRepairOutcome(
  turn: ForcedRespondTurn,
  signal: AbortSignal,
  slotCountAtDispatch: number,
): FollowUpDriveFailure | FollowUpRespondOutcome {
  switch (turn.kind) {
    case "respond":
      return {
        kind: "respond_outcome",
        slotCountAtDispatch,
        turn: { kind: "payload", payload: turn.payload },
      };
    case "noncompliance":
      return {
        kind: "respond_outcome",
        slotCountAtDispatch,
        turn: {
          kind: "noncompliance",
          branch: turn.branch,
          raw_response: turn.raw_response,
        },
      };
    case "transport":
      if (signal.aborted) {
        return { kind: "provider_failure", error: makeCancelledError() };
      }
      return { kind: "provider_failure", error: turn.error };
  }
}

/** The resolved request auth (apiKey/headers) an off-session `complete()` threads. */
interface OffSessionRequestAuth {
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
}

/**
 * Bug 0010 (auth threading, increments C+D): resolve a model's request auth
 * off the model registry — the `#completeBinderReply` pattern — PROBING for
 * the optional `getApiKeyAndHeaders` capability first. WHY the probe: the
 * capability is genuinely optional on harness registries (the frozen bug-0007
 * suite constructs `modelRegistry: {}`), and auth is an enrichment, not a
 * precondition — its absence must not crash a dispatch that a credential-less
 * host could still serve. `undefined` = thread no auth options.
 */
async function resolveRegistryAuth(
  modelRegistry: ModelRegistry,
  model: Model<Api> | undefined,
): Promise<OffSessionRequestAuth | undefined> {
  if (model === undefined) {
    return undefined;
  }
  const registry = modelRegistry as {
    readonly getApiKeyAndHeaders?: (m: Model<Api>) => Promise<{
      readonly ok: boolean;
      readonly apiKey?: string;
      readonly headers?: Record<string, string>;
    }>;
  };
  if (typeof registry.getApiKeyAndHeaders !== "function") {
    return undefined;
  }
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return undefined;
  }
  return {
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: auth.headers } : {}),
  };
}

/** Concatenate the text content of an assistant message (thinking / tool calls omitted). */
function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * The classified resolution of one off-session `complete()` dispatch (bug
 * 0007): the reply's assistant text on a normal terminator, or the classified
 * provider failure. A resolved discriminated value — never throw-based control
 * flow: pi-ai's `complete()` RESOLVES its provider failures on most adapters
 * (the per-API adapter converts a caught throw into a reply carrying
 * `stopReason: "error"`), so classification is a probe over the resolved
 * reply, not a `catch`. Bug 0481 observation: the `anthropic-messages`
 * adapter's `result()` instead THROWS the error-terminated stream's message,
 * so on that adapter a provider failure arrives at the call site's own catch
 * arm and never reaches this classifier — both dispatch sites handle both
 * arms.
 */
type OffSessionCompletion =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "failure"; readonly error: TransportError | ContextOverflowError };

/**
 * The stop reasons that terminate an off-session turn normally. pi-ai's
 * `StopReason` union spells the turn boundary `"stop"` and the tool boundary
 * `"toolUse"`; the spec's stop-reason arm names `end_turn` / `stop` /
 * `tool_use` (provider-error-mapping.md §Stop-reason classification) — both
 * spellings are covered so neither surface's normal terminator is ever
 * classified as a failure.
 */
const OFF_SESSION_NORMAL_STOP_REASONS: ReadonlySet<string> = new Set([
  "stop",
  "end_turn",
  "toolUse",
  "tool_use",
]);

/**
 * Bug 0007: probe the resolved off-session reply's `stopReason` before any
 * text extraction. On most adapters pi-ai's `complete()` resolves a provider
 * failure as a reply carrying `stopReason: "error"` (+ optional
 * `errorMessage`), making this probe that failure surface; the
 * `anthropic-messages` adapter instead REJECTS (bug 0481: its `result()`
 * throws the error text), which the call sites' catch arms own. A normal terminator passes through to the text
 * extraction; EVERY other string `stopReason` (`"error"`, `"length"`,
 * `"aborted"`, `"content_filter"`, any unrecognised) routes through the
 * existing `classifyProviderResponse` table with the status THIS call
 * actually captured (bug 0182): `httpStatus: captured?.status ?? null`.
 * `ProviderClassifierInput.httpStatus`'s own doc-comment
 * (`src/binder/provider-error-mapping.ts`) admits only a real captured value
 * or that `null` — nothing else — so a caller whose `onResponse` never fires
 * feeds the classifier the network-level `null` class, never a stand-in 200.
 */
function classifyOffSessionReply(
  model: Model<Api>,
  reply: AssistantMessage,
  captured: ProviderResponse | undefined,
): OffSessionCompletion {
  const provider = String(model.api);
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  // A non-string/absent `stopReason` is not a provider failure: pi-ai always
  // sets the field on a resolved reply, so only a fabricated double reaches
  // here without one — treat it as a normal terminator rather than classifying
  // fixture shorthand as a transport failure.
  if (typeof stopReason !== "string" || OFF_SESSION_NORMAL_STOP_REASONS.has(stopReason)) {
    // PIC-53 disposition: a pure tool-use turn that produced no assistant text
    // yields the empty string — a legitimate `Ok("")`, distinct from the
    // error-stop empty content classified below.
    return { kind: "text", text: assistantText(reply) };
  }
  const errorMessage = reply.errorMessage;
  const partialText = assistantText(reply);
  const classified = classifyProviderResponse({
    api: provider,
    httpStatus: captured?.status ?? null,
    stopReason,
    ...(typeof errorMessage === "string" ? { errorMessage } : {}),
    rawResponse: partialText !== "" ? partialText : null,
  });
  // Stop-reason classification (provider-error-mapping.md): the overflow arm
  // (`length`, or an overflow-signature `errorMessage`) surfaces the
  // classifier's `ContextOverflowError` verbatim — token extraction and
  // `raw_response` included.
  if (classified.kind === "context_overflow") {
    return { kind: "failure", error: classified as ContextOverflowError };
  }
  // Every other classification folds to the off-session transport surface:
  // message from the classifier, `http_status` / `retryable` threaded from the
  // classifier's OWN verdict (bug 0291; provider-error-mapping.md:7 routes the
  // no-HTTP-response class through `{ retryable: true, http_status: null }`, :13
  // gives 5xx/429 `retryable: true` and carries a captured status). `provider`
  // is the resolved model's api-shaped `.api` (queryerror-variants.md). An
  // empty/absent classifier message still takes PIC-51's fixed fallback; the
  // `as` casts mirror the overflow arm (`kind` is `string`, ERR-15 openness).
  const message =
    classified.kind === "transport" && classified.message !== ""
      ? classified.message
      : PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE;
  return {
    kind: "failure",
    error: {
      kind: "transport",
      message,
      http_status: classified.kind === "transport" ? (classified as TransportError).http_status : null,
      provider,
      retryable: classified.kind === "transport" ? (classified as TransportError).retryable : false,
    },
  };
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

/**
 * Bug 0010 (QRY-14 step 2 / SLSH-2 / conversation-drive.md typed bullet):
 * dispatch ONE typed-query forced respond turn OFF-SESSION through pi-ai's
 * `complete()` free function — the binder's channel, the only one that carries
 * `options.toolChoice` (spec finding T34). `context.tools` is exactly the
 * synthesised respond tool, the tool choice is forced to it, the theta signal
 * and registry auth thread as options, and the reply resolves to the seam's
 * `ForcedRespondTurn`:
 *
 *   - EXTRACTION FIRST (binder-inference.md rule): the FIRST `ToolCall` content
 *     part naming the respond tool supplies the payload from its `arguments` —
 *     success extraction PRECEDES stopReason classification, so a late `error`
 *     stop never launders a delivered payload into a transport Err.
 *   - No matching call + a non-normal stopReason: the 0007/0009-aligned
 *     stop-reason classification (`classifyOffSessionReply`), provider = the
 *     RESOLVED RESPOND MODEL's `.api` (queryerror-variants.md §provider
 *     derivation). A non-string/absent stopReason stays a NORMAL terminator
 *     (fixture shorthand is never classified as a failure).
 *   - No matching call + a normal stopReason: ERR-17 non-compliance —
 *     `wrong_tool` when any ToolCall is present (first block's name), else
 *     `plain_text`; `raw_response` = the assistant text, or null when empty.
 *
 * A REJECTED `complete()` promise maps to the transport arm: "cancelled"
 * when the theta signal aborted, else the coerced throw message. On most
 * adapters a rejection is abort/defect-shaped (provider failures resolve as
 * `stopReason: "error"` replies); the `anthropic-messages` adapter also
 * rejects on PROVIDER failures (bug 0481: its `result()` throws the error
 * text), so the catch arm consults the bug-0481 rejection predicate before
 * mapping to transport.
 */
async function dispatchForcedRespondTurn(
  respond: RespondTurnContext,
  messages: readonly Message[],
): Promise<ForcedRespondTurn> {
  if (respond.signal.aborted) {
    // Pre-dispatch abort gate (bug 0010 fix review, F1 — the r7 discipline
    // generalised to EVERY forced respond dispatch): an already-aborted theta
    // signal must never reach `complete()` — a post-abort provider call is
    // token waste against a cancelled query and its reply could only be
    // discarded. The fixed "cancelled" transport shape is returned for the
    // seam's totality; the typed loop maps a signal-aborted transport outcome
    // to its CANCELLED arm (cancellation.md §Surfacing), so this shape is not
    // author-visible on the loop path.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider: String(respond.model?.api ?? "unknown"),
        retryable: false,
      },
    };
  }
  if (respond.model === undefined) {
    // No frontmatter `model:` resolution and no session-pinned `ctx.model`:
    // there is nothing to dispatch against — a transport Err with the fixed
    // sentinel provider, mirroring the off-session model-unavailable posture.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "no resolved model for the typed-query forced respond turn",
        http_status: null,
        provider: "unknown",
        retryable: false,
      },
    };
  }
  const model = respond.model;
  const provider = String(model.api);
  const tool: Tool = respondToolEntry(respond);
  const auth = await respond.auth();
  // Bug 0481: at most TWO dispatches — the forced one, plus ONE degraded
  // re-issue (toolChoice omitted) when the provider rejects forcing at the
  // MODEL level (`isForcedToolChoiceRejection` over the raw resolved-failure
  // errorMessage). Stateless across dispatches: a repair restart re-forces
  // first, exactly like a fresh query.
  let degraded = false;
  for (;;) {
  // Bug 0182: a per-dispatch capture, mirroring `#classifyBinderAttempt`'s —
  // each forced respond call (a fresh attempt, or a repair restart) is its
  // own invocation, so a module-level slot would carry one dispatch's status
  // into the next's classification (CLAUDE.md: no globals/statics/singletons).
  let captured: ProviderResponse | undefined;
  const onResponse = (response: ProviderResponse): void => {
    captured = response;
  };
  const options: Record<string, unknown> = {
    // The forced tool choice — the entire content of spec finding T34
    // (`pi.sendUserMessage` exposes no toolChoice; `complete()` is the channel)
    // — spelled per the resolved respond model's api (bug 0010 fix round 1;
    // see FORCED_TOOL_CHOICE_BY_API in binder/forced-tool-choice.ts, shared
    // with the binder inference call since bug 0011). OMITTED on the bug-0481
    // degraded re-dispatch: the context still carries exactly one tool and the
    // trailing template instructs the model to call it, so `auto` is the
    // strongest request a forcing-rejecting model admits.
    ...(degraded ? {} : { toolChoice: forcedToolChoiceForApi(provider, respond.toolName) }),
    // CANCEL-4-style in-flight forwarding: the theta signal threads into the
    // provider invocation so an abort during the call propagates.
    signal: respond.signal,
    onResponse,
    ...(auth ?? {}),
  };
  let reply: AssistantMessage;
  try {
    reply = await complete(model, { messages: [...messages], tools: [tool] }, options);
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — an aborted/defective complete() rejection → transport Err
    if (respond.signal.aborted) {
      // Mirrors `#classifyBinderAttempt`: an abort observed at the rejection is
      // the cancellation, not a retryable transport failure; the loop's
      // checkpoint surfaces `cancelled` downstream.
      return {
        kind: "transport",
        error: {
          kind: "transport",
          message: "cancelled",
          http_status: null,
          provider,
          retryable: false,
        },
      };
    }
    const thrownMessage = coerceUnderlyingString(thrown);
    // Bug 0481 (throw arm): the anthropic adapter's `result()` converts an
    // error-terminated stream into a THROW (`throw new Error(errorMessage)`,
    // pi-ai dist/api/anthropic-messages.js), so the model-level forcing
    // rejection arrives HERE on that adapter — not as a resolved
    // `stopReason: "error"` reply. Same one-shot degradation as the resolved
    // arm below.
    if (!degraded && isForcedToolChoiceRejection(thrownMessage)) {
      degraded = true;
      continue;
    }
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: thrownMessage,
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // EXTRACTION FIRST (binder-inference.md): the first ToolCall naming the
  // respond tool supplies the payload — before ANY stopReason probe.
  const calls = reply.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
  const match = calls.find((call) => call.name === respond.toolName);
  if (match !== undefined) {
    // Bug 0028 §Fix: the forced dispatch reads the provider's arguments
    // directly (no host validation runs on this channel), so the wire→payload
    // mapping the on-session `execute` gets from `prepareArguments` + the
    // envelope unwrap is applied here explicitly — same function, same result
    // for the same wire bytes.
    return { kind: "respond", payload: respondPayloadFromWire(respond.lowered, match.arguments) };
  }
  // Aborted precedence (bug 0010 fix round 1): pi-ai's `complete()` RESOLVES
  // an abort — the adapter surfaces `stopReason: "aborted"` rather than
  // rejecting — so the catch arm below never sees it. Mirror the prompt path's
  // aborted precedence here: an aborted signal or an aborted-stop reply maps
  // to the fixed "cancelled" transport Err (the loop's checkpoint surfaces
  // `cancelled` downstream), never to ERR-17 non-compliance (an abort is not
  // the model declining the tool). Extraction above still wins when a matching
  // ToolCall is present — a raced valid answer is a valid answer.
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  if (respond.signal.aborted || stopReason === "aborted") {
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // No matching call: classify the stop reason through the 0007/0009-aligned
  // table (provider = the resolved RESPOND model's `.api`).
  const classified = classifyOffSessionReply(model, reply, captured);
  if (classified.kind === "failure") {
    // Bug 0481: the MODEL-level forcing rejection — consulted only on a
    // classified FAILURE (mirroring the binder site's failure-block placement)
    // and on the RAW errorMessage, which the classifier would summarise away.
    // One shot: the degraded pass re-enters this identical interpretation
    // pipeline, where a repeat rejection no longer matches this arm.
    if (
      !degraded &&
      isForcedToolChoiceRejection(reply.errorMessage)
    ) {
      degraded = true;
      continue;
    }
    return { kind: "transport", error: classified.error };
  }
  // ERR-17: a normal terminator with no matching respond call is
  // non-compliance — `wrong_tool` when the model called something else,
  // `plain_text` when it called nothing.
  const branch: ForcedRespondBranch =
    calls.length > 0
      ? {
          kind: "wrong_tool",
          providerToolName: calls[0]!.name,
          respondToolName: respond.toolName,
        }
      : { kind: "plain_text" };
  const raw = assistantText(reply);
  return { kind: "noncompliance", branch, raw_response: raw !== "" ? raw : null };
  }
}

export { OFF_SESSION_NORMAL_STOP_REASONS, LivePromptQueryModel, resolveRegistryAuth, RESPOND_TOOL_DESCRIPTION, RESPOND_CAPTURED_TEXT, RESPOND_REPEAT_TEXT, respondToolExecuteResult };
export type { ActiveRespondCapture, RespondTurnContext, RespondToolExecuteResult };
