// Live prompt-query turns: the on-session `QueryModelDriver` and its repair-outcome mapping (turn settlement lives in ./turn-settlement, the respond-capture contract in ./respond-capture, and the off-session forced respond dispatch in ./off-session-respond-dispatch).

import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import type { Clock, TimerHandle } from "../seams/clock";
import {
  buildPiFallbackSystemNoteChannel,
  sendSystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
import { extractTrailingTurnText, computeActiveSetInstall, type CallableSetInstall } from "../runtime/conversation-drive";
import { probePostTurnFailure, mapPromptModeSyncThrow, mapPromptModeTurnLifecycleExpiry, trailingTurnUserIndex, type PromptModeTurnLifecyclePhase } from "../runtime/prompt-transport-mapping";
import type { ForcedRespondTurn, FreePhaseTurn, QueryModelDriver } from "../runtime/query-tool-loop";
import type { CommittedSideEffect } from "../runtime/no-rollback";
import type { ContextOverflowError, TransportError } from "../runtime/query-error";
import { abortForAgentEnd, makeCancelledError } from "../runtime/cancellation-core";
import {
  classifyHostRecoverySettle,
  PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
  PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND,
} from "./host-recovery";
import { parseStructuredPayload, payloadForRespond, type FollowUpDriveFailure, type FollowUpRespondOutcome } from "../runtime/typed-query-validation";
import {
  withActiveSetGate,
  withModelWindow,
  withThinkingWindow,
  type ActiveSetGateDeps,
  type ModelWindowDeps,
  type ThinkingWindowDeps,
} from "../runtime/tool-registration";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { PromptToolLoopGovernor, type PromptToolLoopExhaustion } from "./prompt-tool-loop-governor";
import type { ActiveRespondCapture, RespondTurnContext } from "./respond-capture";
import { macrotask, thisTurnSettled, trailingCompactionUnanswered, POLL_INTERVAL_MS, PRE_SEND_GATE_POLL_BOUND, TURN_START_POLL_BOUND, TURN_END_POLL_BOUND, WAIT_FOR_IDLE_BOUND_MS, TURN_SETTLE_POLL_BOUND } from "./turn-settlement";
import { dispatchForcedRespondTurn } from "./off-session-respond-dispatch";

/**
 * Bug 0483 §Fix item 2: the settle-poll bound applied when this attempt's
 * `ctx.signal` recorded an abort — a short grace at the SAME poll cadence
 * (`POLL_INTERVAL_MS`) as the full settle bound, not the full
 * `TURN_SETTLE_POLL_BOUND` (1000 polls / 10s): a pre-first-token ESC (no
 * trailing assistant will ever arrive) must classify `cancel` promptly rather
 * than sit out the full settle wait. The recovery arms rest on the recorded
 * host behaviour (PIC-78 posture 1): a retry extension rewrites the aborted
 * turn at its `message_end`, after the abort, and an extension-aborted run
 * settles promptly — so the tagged trailing assistant is committed before the
 * run reads idle and this poll clears on its first reads.
 */
const HOST_RECOVERY_ABORT_SETTLE_GRACE_POLL_BOUND = 50;

/**
 * The index of the newest compaction summary in a built session message list,
 * `-1` when it carries none. `buildContextEntries` places the latest
 * compaction at the head, ahead of its kept entries, so an older compaction
 * inside the kept range projects a second summary AFTER the newest one; the
 * first summary is the newest. The summary is pi's `compactionSummary`
 * context message, a role outside pi-ai's `Message` union, hence the widened
 * read.
 */
function newestCompactionSummaryIndex(messages: readonly Message[]): number {
  for (let i = 0; i < messages.length; i += 1) {
    const role: string | undefined = messages[i]?.role;
    if (role === "compactionSummary") {
      return i;
    }
  }
  return -1;
}

/**
 * Bug 0483 §Fix item 2: one attempt's deferred `ctx.signal` abort — the
 * listener records the source reason here instead of forwarding it into
 * `thetaAbort` at signal time.
 *
 * `ctx.signal` is the ACTIVE agent run's own signal (pi-agent-core
 * `Agent.signal`), and one driven turn can span several runs: pi's core
 * retry after a retryable error, overflow compaction, and a queued or
 * `agent_before_settle` message each start a fresh run with a fresh signal
 * inside the same turn. A recorder bound to the first run alone would miss
 * an abort of any later run, so `follow` re-arms on every new run signal it
 * is shown, detaching the previous listener, and a later abort overwrites
 * the recorded reason: the LATEST recorded reason is the one a `cancel`
 * forwards (CNCL-4).
 */
class DeferredHostAbort {
  #recorded = false;
  #reason: unknown = undefined;
  #watched: AbortSignal | undefined = undefined;
  #onAbort: (() => void) | undefined = undefined;

  get recorded(): boolean {
    return this.#recorded;
  }

  get reason(): unknown {
    return this.#reason;
  }

  /**
   * Watch `signal` for an abort when it is a run signal not yet watched; the
   * currently watched signal and `undefined` (no active run) are no-ops.
   */
  follow(signal: AbortSignal | undefined): void {
    if (signal === undefined || signal === this.#watched) {
      return;
    }
    this.dispose();
    this.#watched = signal;
    if (signal.aborted) {
      this.#record(signal);
      return;
    }
    const onAbort = (): void => this.#record(signal);
    this.#onAbort = onAbort;
    signal.addEventListener("abort", onAbort, { once: true });
  }

  /** Detach the listener on the watched signal; the recorded state is kept. */
  dispose(): void {
    if (this.#watched !== undefined && this.#onAbort !== undefined) {
      this.#watched.removeEventListener("abort", this.#onAbort);
    }
    this.#onAbort = undefined;
  }

  #record(signal: AbortSignal): void {
    this.#recorded = true;
    this.#reason = signal.reason;
  }
}

/**
 * Bug 0373 §Fix: the narrow ExtensionAPI subset `LivePromptQueryModel` stores.
 * A stored `#pi: ExtensionAPI` class field is the inventory-closure audit's
 * prohibited non-parameter carrier binding (audit-recognised-shapes.md family
 * (4)) — it would let any `this.#pi.<member>` reach escape audit coverage. A
 * `Pick`-narrowed structural cap consumes exactly the members used and is not a
 * carrier binding, mirroring production-host-loop-dispatch.ts's `HostLoopPi`.
 * `getActiveTools`/`setActiveTools` are threaded whole into `ActiveSetGateDeps`;
 * `getThinkingLevel`/`setThinkingLevel` into `ThinkingWindowDeps` (bug 0491).
 */
type LivePromptQueryPi = Pick<
  ExtensionAPI,
  | "sendMessage"
  | "sendUserMessage"
  | "getActiveTools"
  | "setActiveTools"
  | "setModel"
  | "getThinkingLevel"
  | "setThinkingLevel"
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
  /** Bug 0491: the theta's `thinking:` pin (absent = no pin). */
  readonly #queryThinking: string | undefined;
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
   * Bug 0483 §"Decided sub-case": whether the last driven turn's attempt
   * loop stopped on a `recovering` settle with the early-respond capture
   * already fired. Reset at each `#driveUserVisibleTurn` entry. Only this
   * exit lets a captured payload pre-empt the PIC-51 probe; every other
   * probe verdict over a captured turn surfaces as usual.
   */
  #endedOnCapturedRecovery = false;
  /**
   * Bug 0483 (PIC-78): whether any attempt of this query was classified
   * through the compaction-relocated trailing-turn read. The compaction that
   * forced that read rebuilt the message list, so `#queryWindowStart` no
   * longer indexes this query's turns and a window-shaped forced respond
   * would replay a stale or empty conversation. Never reset: the rebuilt list
   * stays rebuilt for every later dispatch of the query.
   */
  #windowRelocated = false;
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
    /**
     * CANCEL-2: the per-invocation controller a driven turn's `ctx.signal`
     * abort is forwarded into — at that turn's settle, once PIC-78 classifies it
     * `cancel` (a host-recovery settle is ridden instead).
     */
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
    /** Bug 0491: the theta's `thinking:` pin (absent = no pin; the session level stands). */
    readonly queryThinking?: string;
  }) {
    this.#queryModel = deps.queryModel;
    this.#queryModelRef = deps.queryModelRef;
    this.#queryThinking = deps.queryThinking;
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
      this.#systemNoteChannel ??
      buildPiFallbackSystemNoteChannel(this.#pi, this.#emitDiagnostic)
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
      // Bug 0483 §"Decided sub-case": when the attempt loop stopped on a
      // host-recovery settle with the early-respond capture already fired, the
      // trailing turn is the tagged retryable error-stop the probe below would
      // map to `Err(transport)`. The free phase ends on a NORMAL boundary
      // instead, so the enclosing loop proceeds to `forcedRespondTurn`, which
      // resolves the captured payload (QRY-14 early respond). Keyed on that
      // exit alone: a captured turn that settled any other way keeps the
      // probe's verdict.
      if (this.#endedOnCapturedRecovery) {
        return { kind: "text", text: "" };
      }
      // PIC-51/PIC-51b: probe the driven turn's trailing `assistant`
      // `stopReason` before extracting text. `probePostTurnFailure`
      // classifies `stopReason: "error"`, the PIC-51b non-normal-terminator
      // arms (`"length"` → context_overflow, every other non-normal terminator
      // → transport), and the absent-trailing-assistant case; every non-`Ok`
      // verdict except `cancelled` diverts here (`excludeCancelled`:
      // cancellation is handled by the enclosing loop's signal guards — bug
      // 0010 F1 / bug 0012 — so it is excluded, not re-classified).
      const failure = probePostTurnFailure(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
        excludeCancelled: true,
      });
      if (failure !== undefined) {
        return { kind: "transport", error: failure as TransportError | ContextOverflowError };
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
      const failure = probePostTurnFailure(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
        excludeCancelled: true,
      });
      if (failure !== undefined) {
        return { kind: "transport", error: failure as TransportError | ContextOverflowError };
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
    // PIC-1 (d) / bug 0355: this restarted free phase's OWN slot count — the
    // governor's `roundsAllowed`, read from the exhaustion snapshot
    // `#driveUserVisibleTurn` just set. It masks a terminal event raised on
    // this follow-up against the follow-up's fresh budget, never the parent's.
    const followUpSlots = this.#exhaustion?.slotCount ?? 0;
    // Bug 0483 (Decided sub-case): the restarted phase's attempt loop
    // stopped on a host-recovery settle with the respond capture already
    // fired. The trailing turn is the tagged retryable error-stop, which the
    // probe below would map to a transport failure; the captured payload
    // resolves the attempt instead (no ride, no fresh dispatch).
    if (this.#endedOnCapturedRecovery) {
      return {
        kind: "respond_outcome",
        slotCountAtDispatch: followUpSlots,
        turn: { kind: "payload", payload: this.#earlyRespond.payload },
      };
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
    const failure = probePostTurnFailure(this.#readMessages(), {
      aborted: this.#thetaAbort.signal.aborted,
      provider: this.#provider,
      excludeCancelled: false,
    });
    if (failure !== undefined) {
      return { kind: "provider_failure", error: failure };
    }
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
    // Bug 0483 (PIC-78): under forced tool choice a provider binds a
    // schema-valid payload even over a window that carries none of this
    // query's turns, so a stale window must fail loudly, never dispatch.
    if (this.#windowRelocated) {
      return Promise.resolve({
        kind: "transport",
        error: {
          kind: "transport",
          message:
            "typed query forced respond turn not dispatched: a mid-turn compaction relocated the driven turn " +
            "(PIC-78), so the query window recorded at the query's first send no longer spans this query's turns",
          http_status: null,
          provider: this.#provider,
          retryable: true,
        },
      });
    }
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
    this.#endedOnCapturedRecovery = false;
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
    // PIC-17 thinking window (bug 0491): wraps the model window because the
    // host's model switch re-derives the thinking level. The session level is
    // snapshotted before any model swap, the pin applied after it, and the
    // snapshot restored after the model restore.
    const thinkingWindowDeps: ThinkingWindowDeps = {
      pi: this.#pi,
      thetaName: this.#thetaName,
      target: this.#queryThinking,
      emitDiagnostic: this.#emitDiagnostic,
      emitSystemNote: (note): void => {
        sendSystemNote(note, this.#resolveSystemNoteChannel());
      },
    };
    try {
      const window = await withActiveSetGate(activeSetGateDeps, () => withThinkingWindow(thinkingWindowDeps, (applyThinkingPin) => withModelWindow(modelWindowDeps, async () => {
        applyThinkingPin();
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
        // Bug 0483 §Fix item 2: the send + start/end/settle polls run as a
        // bounded ATTEMPT LOOP — one original send plus up to
        // `PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND` continuation re-drives — all
        // inside this SAME open active-set/model/thinking window and the SAME
        // armed governor budget (a recovery ride never mints fresh budget).
        let attemptText = text;
        let rides = 0;
        // The current attempt's recorder, held here so the `finally` detaches
        // its listener on every exit path.
        let liveRecorder: DeferredHostAbort | undefined;
        try {
          for (;;) {
            // Bug 0414 (conversation-drive.md PIC-70): an abort observed inside
            // the pre-send-gate window must short-circuit the send. `#pollWhile`
            // exits on the aborted signal but returns the SESSION idle-state, so an
            // Esc burst that both idles the ambient run and aborts `thetaAbort`
            // clears the gate; without this guard the first attempt issues a
            // post-cancel user-visible turn that is never torn down (the bug-0319
            // teardown listener refuses to attach on an already-aborted signal).
            // The PIC-51 probe's cancelled short-circuit already answers
            // `Err(cancelled)`; mirrors `driveRepairAttempt`'s boundary abort check.
            // A continuation attempt is guarded by the same check ahead of its ride
            // note (below); a `cancel` classification returns directly and never
            // reaches here.
            if (this.#thetaAbort.signal.aborted) {
              return;
            }
            // Bug 0288 §Fix item 3/4 / bug 0483 §Fix item 2: the message-list
            // length recorded BEFORE this attempt's own send, the boundary its OWN
            // user entry must land at or after. A settled-slice read that ignored
            // this boundary could still anchor on an EARLIER turn's (already-settled)
            // user entry and silently re-extract its text (P2's exact failure shape)
            // instead of failing loudly over this attempt's own, still-unattributed
            // one. Each continuation attempt records its own boundary, so the settle
            // polls and the classification read the RETRIED attempt's slice, never
            // the aborted one's.
            const messagesBeforeSend = this.#readMessages();
            const turnStart = messagesBeforeSend.length;
            // The trailing `user` message before this attempt's send, by identity:
            // the relocated trailing-turn read below must never take it for this
            // attempt's own anchor.
            const userBeforeSend = messagesBeforeSend[trailingTurnUserIndex(messagesBeforeSend)];
            // The leaf-path entry ids before this attempt's send: a `compaction`
            // entry absent from them was appended during this attempt, the only
            // compaction that can explain this attempt's own user message missing
            // from the rebuilt list (`#ownTrailingTurnSlice`).
            const pathIdsBeforeSend: ReadonlySet<string> = new Set(
              this.#readContextPath().map((entry) => entry.id),
            );
            // PIC-50: `pi.sendUserMessage` is the only failure the call surface itself
            // can signal synchronously. Map such a throw to a `TransportError` (never
            // `theta/runtime/internal-error`, never a swallowed `Ok("")`) and return
            // without issuing a turn; the driver surfaces it as the query's transport
            // `Err`. The gate's `finally` still restores the ambient active set.
            try {
              this.#pi.sendUserMessage(attemptText);
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
            // Bug 0483 §Fix item 2 (PIC-78): once the start poll has cleared,
            // `ctx.signal` is the signal of the run THIS attempt started whenever
            // the host observed it streaming (it is `undefined` at idle slash-entry,
            // and inert below when the fast path never observed the run non-idle at
            // all); the end-poll re-arms the recorder on each later run of the same
            // turn. The recorder RECORDS the abort reason and leaves `thetaAbort`
            // alone: a stall-watchdog `ctx.abort()` and a user ESC abort the SAME
            // signal with no marker distinguishing them (§Measured host facts), so
            // the cancel-or-ride decision waits for this attempt's settle, below.
            // Decision 6 / Increment B2: this per-attempt listener is deliberately
            // NOT collected onto the shared `forwardingSignals` sink; the recorder
            // detaches it when a later run's signal replaces it, when the next
            // attempt starts, and in this loop's `finally`.
            liveRecorder?.dispose();
            const recorder = new DeferredHostAbort();
            liveRecorder = recorder;
            recorder.follow(this.#ctx.signal);
            if (!this.#ctx.isIdle()) {
              // Bug 0288 §Fix item 4: bounded end-poll, then a bounded `waitForIdle`
              // race, then a bounded wait for THIS turn's own slice to settle. Each
              // expiry is the query's loud `Err` — no ≈600s walk-out (P6), no
              // unbounded `waitForIdle` (P5: `_isAgentRunActive` clears before the
              // `agent_settled` emit is awaited, so a flag-based wait alone is not a
              // turn-completion signal).
              // With a recorded abort, an expiry of either wait resolves `cancel`
              // with the recorded reason instead (PIC-78; `#recordLifecycleExpiry`).
              // The end-poll itself is not shortened: on pi <= 0.86 the session reads
              // non-idle through the in-run retry's backoff, and that IS the recovery.
              // Each non-idle read shows the recorder the run signal then current, so
              // an abort of a later run of this turn (core retry, overflow
              // compaction, a queued message) is recorded too. Only non-idle reads
              // re-arm: a signal still exposed after the run settled belongs to the
              // post-settle `agent_end` site below.
              const endCleared = await this.#pollWhile(() => {
                if (this.#ctx.isIdle()) {
                  return false;
                }
                recorder.follow(this.#ctx.signal);
                return true;
              }, TURN_END_POLL_BOUND);
              if (!endCleared) {
                this.#recordLifecycleExpiry("settle", TURN_END_POLL_BOUND * POLL_INTERVAL_MS, recorder);
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
                this.#recordLifecycleExpiry("settle", WAIT_FOR_IDLE_BOUND_MS, recorder);
                return;
              }
            }
            // Bug 0483 §Fix item 2: with a recorded abort the settle poll runs only
            // the short grace (`HOST_RECOVERY_ABORT_SETTLE_GRACE_POLL_BOUND` says why).
            const settleBound = recorder.recorded
              ? HOST_RECOVERY_ABORT_SETTLE_GRACE_POLL_BOUND
              : TURN_SETTLE_POLL_BOUND;
            // A mid-turn compaction can leave this attempt's slice unopenable at
            // `turnStart`: an overflow compaction rebuilds the list shorter, so the
            // attempt's own user message sits BEFORE `turnStart`, and a split-turn
            // compaction (the cut falls inside the turn once its own content
            // outgrows the kept-recent budget) summarises that user message away
            // entirely. With a recorded abort the poll therefore also clears the
            // moment the trailing turn `#ownTrailingTurnSlice` locates reads
            // settled, rather than at the grace's end: a retry extension re-kicks
            // the session about a second after its abort, and that re-kick's user
            // message would otherwise become the trailing turn's anchor first.
            const trailingSettledSlice = (): readonly Message[] | undefined =>
              recorder.recorded && !this.#thetaAbort.signal.aborted
                ? this.#ownTrailingTurnSlice(userBeforeSend, pathIdsBeforeSend)
                : undefined;
            await this.#pollWhile(
              () =>
                !thisTurnSettled(this.#readMessages(), turnStart, this.#readContextPath()) &&
                trailingSettledSlice() === undefined,
              settleBound,
            );
            let turnSlice: readonly Message[];
            if (thisTurnSettled(this.#readMessages(), turnStart, this.#readContextPath())) {
              // Bug 0483 §Fix item 2: which site observed the abort. The mid-turn
              // recorder above (CNCL-4 identity: its RECORDED reason is what a
              // `cancel` classification forwards), or, only when the recorder never
              // fired, the post-settle CANCEL-2 `agent_end` trigger: `ctx.signal`
              // observed aborted only AFTER this attempt settled, whose `cancel`
              // classification forwards `abortForAgentEnd`'s synthesised reason.
              const postSettleAbortObserved =
                !recorder.recorded && this.#ctx.signal?.aborted === true && !this.#thetaAbort.signal.aborted;
              if (!recorder.recorded && !postSettleAbortObserved) {
                // No abort observed anywhere for this attempt: a normal settle.
                // Fall through to the ordinary probe/extraction outside this loop
                // (the ≤ 0.86 in-run-retry "recovered" residue, reachable with NO
                // abort at all, is handled entirely by the PIC-53 extraction fix,
                // item 3 — no classification needed here, per §Out of scope).
                return;
              }
              turnSlice = this.#readMessages().slice(turnStart);
            } else {
              // The slice at `turnStart` never opened. Classify the compaction-
              // relocated trailing turn instead, so a host recovery of the
              // post-compaction run rides rather than cancels. No such turn (the
              // pre-first-token ESC, a send that never landed, or a missing anchor
              // no compaction of this attempt explains) is an expiry that cancels
              // with the recorded reason.
              const trailingSlice = trailingSettledSlice();
              if (trailingSlice === undefined) {
                this.#recordLifecycleExpiry("settle", settleBound * POLL_INTERVAL_MS, recorder);
                return;
              }
              this.#windowRelocated = true;
              turnSlice = trailingSlice;
            }
            // Bug 0483 §Fix item 1: classify the settled turn against the host's
            // OWN retry classifier.
            let finalAssistant: AssistantMessage | undefined;
            for (let i = turnSlice.length - 1; i >= 0; i -= 1) {
              const candidate = turnSlice[i];
              if (candidate?.role === "assistant") {
                finalAssistant = candidate;
                break;
              }
            }
            const classification = classifyHostRecoverySettle(
              turnSlice,
              finalAssistant,
              this.#ctx.model?.contextWindow ?? 0,
            );
            if (classification === "cancel") {
              if (recorder.recorded) {
                // CNCL-4 reason identity: forward the LATEST recorded source reason.
                this.#thetaAbort.abort(recorder.reason);
              } else {
                // CANCEL-2 (agent_end user-cancel trigger, CNCL-4 synthesised
                // reason): a turn that ended aborted without a forwarded source
                // reason flips `thetaAbort` with the synthesised
                // `"theta cancelled by agent_end"` reason.
                abortForAgentEnd(this.#thetaAbort);
              }
              return;
            }
            if (classification === "recovered") {
              // The retry already re-ran the turn (pi ≤ 0.86 in-run core retry):
              // discard the recorded abort and fall through to the normal
              // probe/extraction below.
              return;
            }
            // classification === "recovering"
            if (capture !== undefined && capture.captured) {
              // §"Decided sub-case": the answer is already in hand — no ride, no
              // continuation send; `forcedRespondTurn` resolves on the captured
              // payload.
              this.#endedOnCapturedRecovery = true;
              return;
            }
            if (rides >= PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND) {
              // Bound spent: discard the recorded abort and let PIC-51 map the
              // settled tagged error-stop to a loud `Err(transport)` carrying its
              // errorMessage — never `cancelled`.
              return;
            }
            // A cancel from another source (session shutdown, a parent invoke)
            // that landed during this attempt ends the drive here, before a ride
            // note could announce a continuation that is never sent.
            if (this.#thetaAbort.signal.aborted) {
              return;
            }
            rides += 1;
            // Bug 0401: an informational note carries NO `details` key.
            sendSystemNote(
              {
                content:
                  `theta /${this.#thetaName}: driven turn aborted by a host stall recovery and marked ` +
                  `retryable; continuing the turn (ride ${rides}/${PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND})`,
                display: true,
              },
              this.#resolveSystemNoteChannel(),
            );
            attemptText = PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT;
          }
        } finally {
          liveRecorder?.dispose();
          if (capture !== undefined) {
            this.#respond?.captureHost.clearActiveCapture();
            if (capture.captured) {
              this.#earlyRespond = { captured: true, payload: capture.payload };
            }
          }
        }
      })));
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
   * The session's trailing turn when it is this attempt's own turn and has
   * settled on an assistant; `undefined` otherwise. The turn opens at PIC-51's
   * last-user anchor; a trailing `user` message identical to the one that
   * trailed before this attempt's send belongs to an earlier turn (this
   * attempt's own entry never landed). A list with no `user` message at all is
   * pi's split-turn compaction layout — the summary, then the turn's kept
   * recent tool rounds, then the post-compaction run — so the turn is the list
   * after the newest compaction summary, the same span PIC-51/PIC-53 read when no
   * `user` message anchors them; only a compaction appended during this
   * attempt (absent from `pathIdsBeforeSend`) explains the missing anchor. An
   * unanswered trailing compaction means the post-compaction run produced
   * nothing.
   */
  #ownTrailingTurnSlice(
    userBeforeSend: Message | undefined,
    pathIdsBeforeSend: ReadonlySet<string>,
  ): readonly Message[] | undefined {
    const path = this.#readContextPath();
    if (trailingCompactionUnanswered(path)) {
      return undefined;
    }
    const messages = this.#readMessages();
    const anchor = trailingTurnUserIndex(messages);
    let turnOpen: number;
    if (anchor !== -1) {
      if (messages[anchor] === userBeforeSend) {
        return undefined;
      }
      turnOpen = anchor;
    } else {
      const compactedThisAttempt = path.some(
        (entry) => entry.type === "compaction" && !pathIdsBeforeSend.has(entry.id),
      );
      const summary = compactedThisAttempt ? newestCompactionSummaryIndex(messages) : -1;
      if (summary === -1) {
        return undefined;
      }
      turnOpen = summary + 1;
    }
    const slice = messages.slice(turnOpen);
    return slice.some((message) => message.role === "assistant") ? slice : undefined;
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
   * the `probePostTurnFailure` probe, which every caller skips once
   * `#transportFromThrow` is set. Leaving it unset on an aborted drive keeps
   * Esc-before-the-first-token answering `Err(cancelled)` promptly, exactly as
   * the PIC-51 probe already did.
   *
   * Bug 0483 (PIC-78): an expiry while `deferred` holds a recorded `ctx.signal`
   * abort resolves `cancel` instead, forwarding the recorded reason (CNCL-4):
   * a genuine ESC over a run that never settles, or whose `waitForIdle` never
   * resolves, is never minted into a transport `Err`.
   */
  #recordLifecycleExpiry(phase: PromptModeTurnLifecyclePhase, boundMs: number, deferred?: DeferredHostAbort): void {
    if (this.#thetaAbort.signal.aborted) {
      return;
    }
    if (deferred?.recorded === true) {
      this.#thetaAbort.abort(deferred.reason);
      return;
    }
    this.#transportFromThrow = mapPromptModeTurnLifecycleExpiry(
      phase,
      boundMs,
      this.#provider,
    );
  }
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

export { LivePromptQueryModel };
export { RESPOND_TOOL_DESCRIPTION, RESPOND_CAPTURED_TEXT, RESPOND_REPEAT_TEXT, respondToolExecuteResult } from "./respond-capture";
export type { ActiveRespondCapture, RespondTurnContext, RespondToolExecuteResult } from "./respond-capture";
export { TURN_END_SETTLE_BOUND_MS } from "./turn-settlement";
export { OFF_SESSION_NORMAL_STOP_REASONS, resolveRegistryAuth } from "./off-session-respond-dispatch";
