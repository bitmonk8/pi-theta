// Bug 0483 — a host-recovery abort (pi-retry's stall watchdog `ctx.abort()` +
// the retryable `message_end` rewrite) cancels the whole theta invocation
// instead of riding through the host's retry of the driven turn.
//
// docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md
// (§Fix, settled 2026-09-28; §"Witnesses (red before → green after)" is this
// file's specification, cells 1–8).
//
// Spec: pi-integration-contract/conversation-drive.md PIC-78 (Prompt-mode
// host-recovery ride-through) — the attempt loop, the classifier, the ride
// bound, and the typed-query captured-respond precedence this file witnesses.
//
// THE DEFECT. `LivePromptQueryModel.#driveUserVisibleTurn`
// (src/extension/live-prompt-query-driver.ts) forwards the per-run
// `ctx.signal` into `thetaAbort` the moment it aborts
// (`forwardSlashCommandCancel`, src/runtime/cancellation-core.ts) and, after
// the settle poll, synthesises a cancel whenever `ctx.signal.aborted` is still
// observable (`abortForAgentEnd`). Both fire before — or regardless of — the
// one observable that distinguishes a host recovery from a user ESC: the
// settled trailing assistant. A recovery settles `stopReason: "error"` with an
// errorMessage pi-ai's `isRetryableAssistantError` accepts; a cancel settles
// `"aborted"` (or with no assistant at all). The §Fix defers the decision to
// turn-settle time and rides a recovery settle instead of cancelling.
// Independently, `extractTrailingTurnText` (src/runtime/conversation-drive.ts)
// joins EVERY assistant message of the trailing turn, so the error-stop residue
// pi's in-run retry keeps in session history contaminates the PIC-53 value.
//
// CELLS (verdict at HEAD a2b75277 in brackets):
//   1. idle-recovery ride (pi ≥ 0.87 shape) → one continuation send,
//      Ok(<continuation text only>)                                  [RED]
//   2. in-run ride (pi ≤ 0.86 shape) → Ok(<retried text only>), zero
//      continuation sends                                            [RED]
//   3. user ESC preserved (aborted settle; pre-first-token)          [GREEN, pin]
//   4. ride bound 3 → Err(transport) carrying the tagged errorMessage [RED]
//   5. answer in hand: typed query, captured respond payload survives
//      a host-recovery abort → Ok(<captured payload>)                [RED]
//   6. clean settle with NO retry residue → Err(cancelled)           [GREEN, pin]
//   7. PIC-53 exclusion `[user, error asst("partial"), stop asst("full")]`
//      → Ok("full")                                                  [RED]
//   8. agent_end gating: post-settle aborted ctx.signal + tagged settle
//      → no synthesised agent_end cancel; the settle rides (one
//      continuation, Ok(<continuation text>), one ride note)         [RED]
//   9. captured respond + non-retryable error-stop, no abort →
//      Err(transport) (the capture pre-empts the probe only on a
//      host-recovery settle)                                    [GREEN, pin]
//  10. captured respond + "length", no abort → Err(context_overflow) [GREEN, pin]
//  11. respond-repair restarted phase: capture, then host-recovery
//      abort → Ok(<captured payload>), no continuation            [RED]
//  12. ESC + a run that never goes idle → the end-poll expiry
//      resolves Err(cancelled), recorded reason                  [GREEN, pin]
//  13. ESC + aborted settle, waitForIdle() never resolves → the
//      race expiry resolves Err(cancelled), recorded reason      [GREEN, pin]
//  14. recorded abort + tagged residue + retried "length" →
//      Err(cancelled) ("recovered" needs a normal boundary)      [GREEN, pin]
//
// Cells 9, 10, 12, 13 and 14 are green at HEAD only because HEAD forwards
// the abort at signal time or has no ride path; they pin the deferred
// path's dispositions for these shapes.
//
// LATER-RUN AND REVIEW CELLS (verdict at a250d9a0, the first fix commit,
// in brackets). One driven turn can span several agent runs, each with its
// own `ctx.signal`; a recorder bound to the first run alone misses them:
//  15. pi ≥ 0.87: core retry after a retryable error starts run 2, the
//      watchdog aborts run 2, the tagged error-stop settles idle →
//      exactly one ride, Ok(<continuation text>)                     [RED]
//  16. pi ≤ 0.86: the same, then core retry re-runs in-run (run 3) →
//      Ok(<retried text>), zero rides — recovered via core retry
//      [GREEN, pin: an unrecorded abort falls through to the same
//      normal extraction a "recovered" classification does]
//  17. ESC aborts run 2 (after a core retry) → Err(cancelled), the ESC
//      reason by identity                                           [RED]
//  18. watchdog abort on run 1, core retry, ESC on run 2 → the LATEST
//      recorded reason (the ESC's) is forwarded                     [RED]
//  19. a recorded abort over a context-overflow error-stop the
//      unanchored retry patterns accept → Err(cancelled), no ride
//      (the host's overflow exclusion)                              [RED]
//  20. the PIC-17 install persists across a ride: no setActiveTools
//      between the original and the continuation send          [GREEN, pin]
//  21. rounds add up across attempts: attempt 1 spends the whole
//      max_rounds budget, attempt 2's tool round is blocked     [GREEN, pin]
//  22. PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT is the continuation text
//      PIC-78 specifies verbatim                                [GREEN, pin]
//
// SETTLE-ANCHOR DRIFT AND RUN-GAP CELLS (verdict at 53e8c200, the review
// round 1 commit, in brackets). An overflow compaction mid-turn rebuilds the
// message list shorter, so the driven user entry sits before `turnStart` and
// `thisTurnSettled` never holds; the settle-grace expiry classifies the
// trailing turn at PIC-51's last-user anchor instead:
//  23. drifted anchor, watchdog abort of the post-compaction run, tagged
//      settle → exactly one ride, Ok(<continuation text>)            [RED]
//  24. drifted anchor, ESC of the post-compaction run, aborted settle
//      → Err(cancelled), the ESC reason by identity             [GREEN, pin]
//  25. drifted anchor, watchdog abort, core retry re-runs in-run →
//      Ok(<retried text>), zero rides ("recovered")                  [RED]
//  26. core-retry backoff: `ctx.signal` reads `undefined` while the
//      session is non-idle; the recorder keeps its state across the gap
//      and records the next run's watchdog abort → one ride     [GREEN, pin]
//  27. every run signal's listener is detached: at the re-arm onto the
//      next run and at the drive's end                          [GREEN, pin]
//
// SPLIT-TURN AND RIDE-DETACH CELLS (verdict at a4d8865d, the review round 2
// commit, in brackets). pi's split-turn compaction cuts inside the turn and
// summarises the driven user message away, so no `user` message anchors the
// trailing turn; the list after the summary is that turn when a compaction
// appended during this attempt is on the leaf path:
//  27b. across a ride, attempt 1's recorder — still watching an
//      unaborted run signal — is detached before the continuation
//      attempt's first host step                              [GREEN, pin]
//  28. split turn (pi ≥ 0.87 layout), watchdog abort of the post-compaction
//      run, tagged settle → exactly one ride, classified on the first
//      settled read                                                  [RED]
//      (cell 23 now asserts the same latency: RED at a4d8865d, the
//      continuation 51 host steps after the idle, at the grace's end)
//  29. split turn (0.80.10 layout, overflow error-stop kept), watchdog
//      abort, core retry re-runs in-run → "recovered"                [RED]
//  30. split turn, ESC of the post-compaction run → Err(cancelled),
//      the ESC reason by identity                              [GREEN, pin]
//  31. no user anchor and no compaction from this attempt (the send's
//      entry never landed over an earlier split-turn compaction) →
//      Err(cancelled) with the recorded reason, no ride        [GREEN, pin]
//
// TYPED-WINDOW AND SUMMARY-ORDER CELLS (verdict at 41f2fe88, the review
// round 3 commit, in brackets). The compaction that forces the relocated read
// rebuilds the message list, so the query window recorded at the first send
// no longer indexes the query's turns:
//  32–35. typed, drifted / split-turn, relocated "recovered" or a ride whose
//      continuation settles → Err(transport, retryable) naming the
//      compaction relocation, zero forced respond dispatches         [RED]
//  36. typed, split turn, relocated "recovering" with a capture this
//      attempt → Ok(<captured payload>), zero dispatches       [GREEN, pin]
//  37. typed control, no compaction → one dispatch over the query
//      turn plus the template                                   [GREEN, pin]
//  38. respond repair: the restarted phase is classified through the
//      relocated read → no fresh dispatch, Err(transport)            [RED]
//  39. two projected compaction summaries: the newest (first) one opens
//      the trailing turn → "recovered"                               [RED]
//
// HARNESS. The bug-0288/0319/0482 scripted-session pattern: drive the REAL
// producer (`createProductionProducerDeps` → `bindPromptConversation` →
// `executeBody`) so the REAL `LivePromptQueryModel` is constructed. The
// injected `Clock`'s `setTimeout` advances the session double by exactly one
// step and fires synchronously (b0482's clock), so one drive poll == one
// scripted host step. The double models the host facts the §Fix measured:
//   - `ctx.signal` is the ACTIVE run's per-run signal (pi-agent-core
//     `Agent.signal` → `activeRun?.abortController.signal`), `undefined` once
//     the run has settled;
//   - an `abort` step aborts that per-run signal the way both a
//     stall-watchdog `ctx.abort()` and user ESC do (no marker distinguishes
//     them at signal time);
//   - a `retryRun` step is pi ≤ 0.86's in-run core retry (`_prepareRetry` →
//     `agent.continue()`): a FRESH run controller, the session never reading
//     idle, the failed assistant kept in session history;
//   - an `idle` step settles the run (pi ≥ 0.87 bails its post-run retry after
//     an extension abort, so the tagged error-stop settles idle);
//   - a `hang` step keeps the run active on every later poll (a host that
//     never settles the run); the `waitForIdle: "never"` drive option
//     models a `waitForIdle()` that never resolves.
// `ctx.abort()` (the bug-0319 reverse bridge target) is spied.
//
// TIER: unit, offline, deterministic, provider-free. The seams under test are
// the driver's cancellation forwarding and the PIC-53 extraction; both are
// reachable with a scripted `SessionManager` double, so no integration or live
// tier is needed here (the live twin is tests/live/b0483-host-recovery-live.test.ts).

// The complete() queue mock must be imported before any production module
// (cell 5 pins ZERO off-session respond dispatches; an empty queue throws).
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import {
  isContextOverflow,
  isRetryableAssistantError,
  type AssistantMessage,
  type Message,
} from "@earendil-works/pi-ai";
import {
  classifyHostRecoverySettle,
  PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
  PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND,
} from "../src/extension/host-recovery";
import { TOOL_LOOP_EXHAUSTED_REASON } from "../src/extension/prompt-tool-loop-governor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { thisTurnSettled, TURN_SETTLE_POLL_BOUND } from "../src/extension/turn-settlement";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  ajv,
  ANTHROPIC_MODEL,
  appendAssistantEntry,
  assistantReply,
  appendMessageEntry,
  appendUserEntry,
  executeResultText,
  expectErrOfKind,
  parse,
  registryDouble,
  type SessionEntryDouble,
  sessionBranch,
} from "./helpers/scripted-live-session-harness";

// --- The host-recovery settle shape -----------------------------------------

/**
 * The errorMessage the pi-retry fork writes on the aborted turn's
 * `message_end` (bug 0483 §Observed / §Second observation). pi's own retry
 * classifier (`isRetryableAssistantError`, pi-ai) accepts it via
 * "provider returned error" — asserted as a premise below so a pi-ai
 * classifier change reds loudly here instead of silently turning every
 * recovery cell into a cancel cell.
 */
const TAGGED_RETRYABLE_ERROR =
  "Request aborted\n\n[stall-watchdog-retry] provider returned error; " +
  "treating stalled provider stream as retryable.";

/** The reason a stall-watchdog `ctx.abort()` leaves on the per-run signal. */
function watchdogAbortReason(): Error {
  return new Error("stall watchdog aborted the provider stream");
}

/** The reason a user ESC leaves on the per-run signal (CNCL-4 identity subject). */
function escAbortReason(): Error {
  return new Error("user pressed ESC");
}

// --- The scripted host ------------------------------------------------------

/** One host step, applied on one drive poll (one `Clock.setTimeout`). */
type HostStep =
  /** Abort the ACTIVE run's per-run signal (watchdog `ctx.abort()` or user ESC). */
  | { readonly kind: "abort"; readonly reason: Error }
  /** Commit an assistant message entry (the post-extension `message_end` shape). */
  | {
      readonly kind: "assistant";
      readonly text?: string;
      readonly stopReason: string;
      readonly errorMessage?: string;
    }
  /** The model calls the typed query's respond tool: execute + toolUse/toolResult entries. */
  | { readonly kind: "respond"; readonly payload: unknown }
  /**
   * One model tool round: fires the governor's captured `before_provider_request`
   * then `tool_call` handlers (the host's order), records the `tool_call`
   * decision, and commits the toolUse/toolResult entries.
   */
  | { readonly kind: "toolRound"; readonly toolName: string }
  /** pi ≤ 0.86 in-run core retry: a fresh run controller; the session stays non-idle. */
  | { readonly kind: "retryRun" }
  /**
   * Core-retry backoff (`_prepareRetry`): the active run handle is cleared, so
   * `ctx.signal` reads `undefined`, while the session stays non-idle; the next
   * `retryRun` starts the fresh run.
   */
  | { readonly kind: "retryBackoff" }
  /**
   * Overflow auto-compaction. `keep: "userEntry"` (default): the
   * `firstKeptEntryId` is this turn's own user entry — `buildSessionContext`
   * then hoists the summary to the head and drops every earlier exchange from
   * the built message list. `keep: "splitTurn"`: pi's split-turn cut — the
   * `firstKeptEntryId` is this turn's last `toolUse` assistant, so the turn's
   * own user message is summarised away and the built list carries no `user`
   * message at all.
   */
  | { readonly kind: "compaction"; readonly keep?: "userEntry" | "splitTurn" }
  /** The run settles: the session reads idle. */
  | { readonly kind: "idle" }
  /** The run never settles: every later poll finds it still active (this step is never consumed). */
  | { readonly kind: "hang" };

/** One driven turn's host script, consumed by one `pi.sendUserMessage`. */
interface TurnScript {
  readonly steps: readonly HostStep[];
  /**
   * How `ctx.signal` exposes this turn's per-run signal. `"live"` (default) is
   * pi-faithful: the active run's signal while it runs, `undefined` once it
   * settles. `"post-settle"` isolates the driver's post-settle `agent_end`
   * synthesis site (cell 8): the signal is `undefined` while the run is active
   * — so the per-turn forward has nothing to attach to — and the settled
   * run's (aborted) signal stays observable after it goes idle, until the
   * next send.
   */
  readonly signalExposure?: "live" | "post-settle";
  /**
   * Whether the send commits its `user` entry. `"dropped"` models a send whose
   * entry never lands while the run still starts.
   */
  readonly userEntry?: "appended" | "dropped";
}

/** The `PromptToolLoopGovernor` handlers the pi double captures from `pi.on(...)`. */
interface GovernorHandlers {
  beforeProviderRequest?: () => void;
  toolCall?: (event: Record<string, unknown>) => unknown;
}

interface ActiveRun {
  controller: AbortController;
  readonly script: TurnScript;
  index: number;
  /** True inside a `retryBackoff`: no active run handle, `ctx.signal` is `undefined`. */
  inBackoff: boolean;
  /** This turn's own user entry id (the compaction's `firstKeptEntryId`); `undefined` when dropped. */
  readonly userEntryId: string | undefined;
}

/** A run signal the host created, with its live `abort` listener count. */
interface TrackedSignal {
  readonly signal: AbortSignal;
  added: number;
  removed: number;
  /** `ticks` when a later run replaced it; `undefined` while it is current. */
  retiredAt: number | undefined;
}

/** Live `abort` listeners on `tracked` (a fired `once` listener is gone with the abort). */
function liveListeners(tracked: TrackedSignal): number {
  return tracked.signal.aborted ? 0 : tracked.added - tracked.removed;
}

/** Append a `compaction` entry chained like `appendMessageEntry` (the b0482 shape). */
function appendCompactionEntry(entries: SessionEntryDouble[], firstKeptEntryId: string): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({
    type: "compaction",
    id,
    parentId,
    summary: "auto-compaction: prior context summarised",
    firstKeptEntryId,
    tokensBefore: 130000,
  } as unknown as SessionEntryDouble);
}

class HostRecoverySession {
  readonly entries: SessionEntryDouble[] = [];
  /** Every `pi.sendUserMessage` text, in order — the continuation-send observable. */
  readonly sends: string[] = [];
  /** Total scripted host steps advanced (one per drive poll). */
  ticks = 0;
  /** `ticks` at the moment the (last) `abort` step fired. */
  abortTick: number | undefined = undefined;
  /** Calls to the unwrapped `ctx.abort()` (the bug-0319 reverse bridge). */
  hostAbortCalls = 0;
  /** Sends issued while the host was streaming (rejected, no entry). */
  rejectedSends = 0;
  /** Executes the registered respond tool (wired by the harness once `pi` exists). */
  respondExecutor: ((payload: unknown) => Promise<unknown>) | undefined = undefined;
  /** Every respond-tool `execute` result promise, in order. */
  readonly respondResults: Promise<unknown>[] = [];
  /** The governor handlers, filled by the pi double's `on`. */
  readonly governor: GovernorHandlers = {};
  /** Every `toolRound` step's `tool_call` decision (`undefined` = allowed), in order. */
  readonly toolCallDecisions: unknown[] = [];
  /** A copy of `entries` at each `idle` step, in order (the drift premise's observable). */
  readonly entriesAtIdle: SessionEntryDouble[][] = [];
  /** `ticks` at each `idle` step, in order. */
  readonly idleTicks: number[] = [];
  /** `ticks` at each `pi.sendUserMessage`, in order (the classification-latency observable). */
  readonly sendTicks: number[] = [];
  /** `ctx.signal` reads that returned `undefined` while the session was non-idle. */
  undefinedSignalReadsWhileActive = 0;
  /** Every run signal, instrumented for listener accounting (cell 27). */
  readonly runSignals: TrackedSignal[] = [];
  /** The most live listeners seen, at a step, on run signals a previous step retired. */
  maxStaleListeners = 0;

  readonly #scripts: TurnScript[];
  #run: ActiveRun | undefined = undefined;
  #postSettleSignal: AbortSignal | undefined = undefined;

  constructor(
    scripts: readonly TurnScript[],
    priorExchanges = 0,
    seed: ((entries: SessionEntryDouble[]) => void) | undefined = undefined,
  ) {
    this.#scripts = [...scripts];
    for (let i = 1; i <= priorExchanges; i += 1) {
      appendUserEntry(this.entries, `prior question ${i}`);
      appendAssistantEntry(this.entries, `prior answer ${i}`, "stop");
    }
    seed?.(this.entries);
  }

  /** The split-turn cut: this turn's last `toolUse` assistant entry. */
  #splitTurnCut(run: ActiveRun): string {
    const opened = this.entries.findIndex((entry) => entry.id === run.userEntryId);
    for (let i = this.entries.length - 1; i > opened; i -= 1) {
      const entry = this.entries[i]!;
      if (entry.type === "message" && entry.message["role"] === "assistant" && entry.message["stopReason"] === "toolUse") {
        return entry.id;
      }
    }
    throw new Error("b0483 scripted host: a split-turn `compaction` step found no toolUse assistant in its turn (fixture defect)");
  }

  /** A fresh run controller whose signal's `abort` listeners are counted. */
  #newRunController(): AbortController {
    const controller = new AbortController();
    const tracked: TrackedSignal = { signal: controller.signal, added: 0, removed: 0, retiredAt: undefined };
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>): void => {
      if (args[0] === "abort") {
        tracked.added += 1;
      }
      add(...args);
    }) as AbortSignal["addEventListener"];
    signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>): void => {
      if (args[0] === "abort") {
        tracked.removed += 1;
      }
      remove(...args);
    }) as AbortSignal["removeEventListener"];
    for (const previous of this.runSignals) {
      previous.retiredAt ??= this.ticks;
    }
    this.runSignals.push(tracked);
    return controller;
  }

  sendUserMessage(text: string): void {
    this.sends.push(text);
    this.sendTicks.push(this.ticks);
    if (this.#run !== undefined) {
      // The host rejects a send while streaming (asynchronously, into its
      // extension-error channel): no entry, no run.
      this.rejectedSends += 1;
      return;
    }
    const script = this.#scripts.shift();
    if (script === undefined) {
      // No silent skipping: a drive that issues more turns than the cell
      // scripted fails loudly naming the unmet precondition.
      throw new Error(
        `b0483 scripted host: send #${this.sends.length} (${JSON.stringify(text)}) had NO scripted turn`,
      );
    }
    let userEntryId: string | undefined;
    if ((script.userEntry ?? "appended") === "appended") {
      appendUserEntry(this.entries, text);
      userEntryId = this.entries[this.entries.length - 1]!.id;
    }
    this.#postSettleSignal = undefined;
    this.#run = { controller: this.#newRunController(), script, index: 0, inBackoff: false, userEntryId };
  }

  isIdle(): boolean {
    return this.#run === undefined;
  }

  /** `ctx.signal` — the per-run signal (pi-agent-core `Agent.signal`). */
  get signal(): AbortSignal | undefined {
    const run = this.#run;
    if (run !== undefined) {
      if (run.inBackoff) {
        this.undefinedSignalReadsWhileActive += 1;
        return undefined;
      }
      return (run.script.signalExposure ?? "live") === "live" ? run.controller.signal : undefined;
    }
    return this.#postSettleSignal;
  }

  /** The unwrapped, Pi-supplied `ctx.abort()`: aborts the active run's signal. */
  hostAbort(): void {
    this.hostAbortCalls += 1;
    this.#run?.controller.abort();
  }

  /** Advance the active run by exactly one scripted host step (one drive poll). */
  tick(): void {
    this.ticks += 1;
    const stale = this.runSignals
      .filter((tracked) => tracked.retiredAt !== undefined && tracked.retiredAt < this.ticks)
      .reduce((sum, tracked) => sum + liveListeners(tracked), 0);
    this.maxStaleListeners = Math.max(this.maxStaleListeners, stale);
    const run = this.#run;
    if (run === undefined) {
      return;
    }
    const step = run.script.steps[run.index];
    if (step === undefined) {
      throw new Error(
        "b0483 scripted host: a turn script ran out of steps without an `idle` step (fixture defect)",
      );
    }
    if (step.kind === "hang") {
      return;
    }
    run.index += 1;
    switch (step.kind) {
      case "abort":
        this.abortTick = this.ticks;
        run.controller.abort(step.reason);
        return;
      case "assistant":
        appendAssistantEntry(this.entries, step.text, step.stopReason, step.errorMessage);
        return;
      case "respond": {
        const executor = this.respondExecutor;
        if (executor === undefined) {
          throw new Error("b0483 scripted host: a `respond` step ran with no respond executor wired");
        }
        // The respond tool's execute captures synchronously (the producer's
        // `#executeRespondTool` has no await before the capture); the entries
        // mirror what pi commits around a tool round.
        this.respondResults.push(executor(step.payload));
        appendMessageEntry(this.entries, {
          role: "assistant",
          content: [{ type: "toolCall", id: "tc-respond", name: "respond", arguments: step.payload }],
          api: "anthropic-messages",
          provider: "anthropic",
          model: "m1",
          stopReason: "toolUse",
          timestamp: 0,
        });
        appendMessageEntry(this.entries, {
          role: "toolResult",
          toolCallId: "tc-respond",
          toolName: "respond",
          content: [{ type: "text", text: "final answer recorded" }],
          isError: false,
          timestamp: 0,
        });
        return;
      }
      case "toolRound": {
        const { beforeProviderRequest, toolCall } = this.governor;
        if (beforeProviderRequest === undefined || toolCall === undefined) {
          throw new Error(
            "b0483 scripted host: a `toolRound` step ran but the governor's before_provider_request/" +
              "tool_call handlers were never registered — the REAL PromptToolLoopGovernor was not reached",
          );
        }
        const toolCallId = `tc-round-${this.toolCallDecisions.length}`;
        beforeProviderRequest();
        this.toolCallDecisions.push(toolCall({ type: "tool_call", toolName: step.toolName, toolCallId, input: {} }));
        appendMessageEntry(this.entries, {
          role: "assistant",
          content: [{ type: "toolCall", id: toolCallId, name: step.toolName, arguments: {} }],
          api: "anthropic-messages",
          provider: "anthropic",
          model: "m1",
          stopReason: "toolUse",
          timestamp: 0,
        });
        appendMessageEntry(this.entries, {
          role: "toolResult",
          toolCallId,
          toolName: step.toolName,
          content: [{ type: "text", text: "tool output" }],
          isError: false,
          timestamp: 0,
        });
        return;
      }
      case "retryRun":
        run.inBackoff = false;
        run.controller = this.#newRunController();
        return;
      case "retryBackoff":
        run.inBackoff = true;
        return;
      case "compaction": {
        const firstKept = (step.keep ?? "userEntry") === "splitTurn" ? this.#splitTurnCut(run) : run.userEntryId;
        if (firstKept === undefined) {
          throw new Error("b0483 scripted host: a `compaction` step kept a user entry the send never committed (fixture defect)");
        }
        appendCompactionEntry(this.entries, firstKept);
        return;
      }
      case "idle":
        this.entriesAtIdle.push([...this.entries]);
        this.idleTicks.push(this.ticks);
        if ((run.script.signalExposure ?? "live") === "post-settle") {
          this.#postSettleSignal = run.controller.signal;
        }
        this.#run = undefined;
        return;
    }
  }
}

// --- Harness ------------------------------------------------------------------

function rootDouble(session: HostRecoverySession): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/** The user session's active tool set before any theta drive touches it. */
const AMBIENT_ACTIVE_TOOLS: readonly string[] = ["ambient_read"];

/** One active-set / send event, in call order (cell 20's observable). */
type ActiveSetEvent =
  | { readonly kind: "setActiveTools"; readonly names: readonly string[] }
  | { readonly kind: "send"; readonly text: string; readonly activeTools: readonly string[] };

interface PiRecord {
  readonly api: ExtensionAPI;
  readonly registeredTools: ToolDefinition[];
  /** Every `theta-system-note` message object as sent, in emission order. */
  readonly notes: Record<string, unknown>[];
  /** Every `setActiveTools` call and every send, in call order. */
  readonly activeSetEvents: ActiveSetEvent[];
  /** The active tool set as the pi double holds it now. */
  activeTools(): readonly string[];
}

function piDouble(session: HostRecoverySession): PiRecord {
  const registeredTools: ToolDefinition[] = [];
  const notes: Record<string, unknown>[] = [];
  const activeSetEvents: ActiveSetEvent[] = [];
  let activeTools: readonly string[] = [...AMBIENT_ACTIVE_TOOLS];
  const api = {
    sendUserMessage: (content: string): void => {
      activeSetEvents.push({ kind: "send", text: content, activeTools: [...activeTools] });
      session.sendUserMessage(content);
    },
    getActiveTools: (): string[] => [...activeTools],
    setActiveTools: (names: string[]): void => {
      activeSetEvents.push({ kind: "setActiveTools", names: [...names] });
      activeTools = [...names];
    },
    registerTool: (tool: ToolDefinition): void => {
      registeredTools.push(tool);
    },
    on: (event: string, handler: (...args: unknown[]) => unknown): void => {
      if (event === "before_provider_request") {
        session.governor.beforeProviderRequest = (): void => {
          void handler(undefined, undefined);
        };
      } else if (event === "tool_call") {
        session.governor.toolCall = (e: Record<string, unknown>): unknown => handler(e, undefined);
      }
    },
    sendMessage: (message: Record<string, unknown>): void => {
      if (message["customType"] === "theta-system-note") {
        notes.push({ ...message });
      }
    },
  } as unknown as ExtensionAPI;
  return { api, registeredTools, notes, activeSetEvents, activeTools: (): readonly string[] => activeTools };
}

/** How the ctx double's `waitForIdle()` behaves: resolved at once (pi-faithful for a settled run) or never. */
type WaitForIdleShape = "resolved" | "never";

function ctxDouble(session: HostRecoverySession, waitForIdle: WaitForIdleShape): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    get signal(): AbortSignal | undefined {
      return session.signal;
    },
    abort: (): void => session.hostAbort(),
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> =>
      waitForIdle === "resolved" ? Promise.resolve() : new Promise<void>(() => {}),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
      getBranch: (): readonly SessionEntryDouble[] => sessionBranch(session.entries),
    },
  } as unknown as ExtensionCommandContext;
}

interface DriveOutput {
  readonly execution: BodyExecution;
  readonly session: HostRecoverySession;
  readonly pi: PiRecord;
  readonly thetaAbort: AbortController;
}

interface DriveOptions {
  readonly waitForIdle?: WaitForIdleShape;
  /** Off-session forced respond replies (the mocked `complete()` queue); empty = none expected. */
  readonly completeQueue?: (typeof scripted)["queue"];
  /** Settled user/assistant exchanges already on the session before the drive (default none). */
  readonly priorExchanges?: number;
  /** Further entries appended after the prior exchanges, before the drive. */
  readonly seed?: (entries: SessionEntryDouble[]) => void;
}

async function driveLiveTheta(
  source: string,
  scripts: readonly TurnScript[],
  options: DriveOptions = {},
): Promise<DriveOutput> {
  scripted.calls = [];
  scripted.queue = [...(options.completeQueue ?? [])];
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new HostRecoverySession(scripts, options.priorExchanges ?? 0, options.seed);
  const pi = piDouble(session);
  session.respondExecutor = (payload: unknown): Promise<unknown> => {
    const tool = pi.registeredTools.find((t) => t.name.startsWith("__theta_respond_"));
    if (tool === undefined) {
      throw new Error("b0483 harness: no respond tool was registered before the scripted respond call");
    }
    return (
      tool.execute as unknown as (id: string, params: unknown, signal: AbortSignal | undefined) => Promise<unknown>
    )("tc-respond", payload, new AbortController().signal);
  };
  const deps = createProductionProducerDeps({
    pi: pi.api,
    root: rootDouble(session),
    modelRegistry: registryDouble(),
  });
  const thetaAbort = new AbortController();
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: ctxDouble(session, options.waitForIdle ?? "resolved"),
    thetaAbort,
  });
  // PIC-58: the subagent-root child drives this same prompt-user-session seam,
  // so these cells cover the child twin (bug 0483 §Fix (c)).
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session)",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session, pi, thetaAbort };
}

/** A one-line rendering of a drive's disposition for assertion messages. */
function disposition(out: DriveOutput): string {
  const reason: unknown = out.thetaAbort.signal.reason;
  return (
    `outcome=${out.execution.outcome}, value=${JSON.stringify(out.execution.result.value)}, ` +
    `error=${JSON.stringify(out.execution.error)}, thetaAbort.aborted=${out.thetaAbort.signal.aborted}` +
    (out.thetaAbort.signal.aborted
      ? ` (reason: ${reason instanceof Error ? reason.message : String(reason)})`
      : "") +
    `, sends=${JSON.stringify(out.session.sends)}`
  );
}

// --- The driven thetas ------------------------------------------------------

const QUERY_TEXT = "Ping";

const ONE_QUERY_THETA = ["---", "mode: prompt", "---", `let v = @\`${QUERY_TEXT}\`?`, "v", ""].join("\n");

const REPAIR_TYPED_QUERY_THETA = [
  "---",
  "mode: prompt",
  "respond_repair:",
  "  attempts: 1",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  `let v: Verdict = @\`${QUERY_TEXT}\`?`,
  "v",
  "",
].join("\n");

/** An untyped query with a one-round tool-loop budget (cell 21). */
const ONE_ROUND_BUDGET_THETA = [
  "---",
  "mode: prompt",
  "tool_loop:",
  "  max_rounds: 1",
  "---",
  `let v = @\`${QUERY_TEXT}\`?`,
  "v",
  "",
].join("\n");

const TYPED_QUERY_THETA = [
  "---",
  "mode: prompt",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  `let v: Verdict = @\`${QUERY_TEXT}\`?`,
  "v",
  "",
].join("\n");

// --- Scripted turn shapes ---------------------------------------------------

/** pi ≥ 0.87: watchdog abort, rewritten tagged error-stop, the run settles idle. */
function idleRecoveryTurn(partial = "partial reply before the stall"): TurnScript {
  return {
    steps: [
      { kind: "abort", reason: watchdogAbortReason() },
      { kind: "assistant", stopReason: "error", text: partial, errorMessage: TAGGED_RETRYABLE_ERROR },
      { kind: "idle" },
    ],
  };
}

/** A normal turn: the reply commits on a normal boundary and the run settles. */
function cleanTurn(text: string): TurnScript {
  return { steps: [{ kind: "assistant", stopReason: "stop", text }, { kind: "idle" }] };
}

/** The PIC-78 ride note content for ride `n` of the `/probe` harness theta, byte-exact. */
function rideNoteContent(n: number): string {
  return (
    "theta /probe: driven turn aborted by a host stall recovery and marked retryable; " +
    `continuing the turn (ride ${n}/${PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND})`
  );
}

/**
 * Assert the note channel carried exactly `count` ride notes (rides 1..count,
 * in order) and nothing else: each the exact template, `display: true`, and
 * NO `details` key (bug 0401: an informational note omits it).
 */
function expectRideNotes(notes: readonly Record<string, unknown>[], count: number): void {
  const expected = Array.from({ length: count }, (_unused, i) => ({
    customType: "theta-system-note",
    content: rideNoteContent(i + 1),
    display: true,
  }));
  expect(notes, `exactly ${count} ride note(s), in ride order; observed ${JSON.stringify(notes)}`).toEqual(expected);
  for (const note of notes) {
    expect("details" in note, `bug 0401: the ride note carries NO details key; observed ${JSON.stringify(note)}`).toBe(
      false,
    );
  }
}

/** An errorMessage the host's retry classifier rejects (no retryable pattern). */
const NON_RETRYABLE_ERROR = "invalid_request_error: messages.0.content: field required";

/** A provider error pi's core retry re-runs with no abort involved (cells 15\u201317's run 1). */
const OVERLOADED_ERROR = '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}';

/**
 * A context-overflow errorMessage: `isRetryableAssistantError` alone accepts
 * it, but the host's `_isRetryableError` excludes it first (cell 19).
 */
const CONTEXT_OVERFLOW_ERROR = "prompt is too long: 205000 tokens > 200000 maximum";

/** Assert the premise that `errorMessage` is one the host's own retry predicate accepts. */
function expectHostRetryable(errorMessage: string): void {
  const probe = { role: "assistant", stopReason: "error", errorMessage } as unknown as AssistantMessage;
  expect(
    isRetryableAssistantError(probe) && !isContextOverflow(probe, 0),
    `fixture premise: the host would retry ${JSON.stringify(errorMessage)}`,
  ).toBe(true);
}

const CONVERSATION_DRIVE = "docs/spec_topics/pi-integration-contract/conversation-drive.md";

/** Read a required spec file as text, failing loudly and naming it if absent. */
function readSpec(relPath: string): string {
  const url = new URL(`../${relPath}`, import.meta.url);
  try {
    return readFileSync(fileURLToPath(url), "utf8");
  } catch (cause) {
    throw new Error(`b0483 precondition unmet: required spec file not readable: ${relPath} (${String(cause)})`);
  }
}

/**
 * The PIC-78 section: from its anchor up to the next line-leading `<a id=`
 * anchor or heading. Fails loudly naming the anchor if it is absent.
 */
function extractPic78(specText: string): string {
  const anchor = '<a id="pic-78">';
  const start = specText.indexOf(anchor);
  if (start === -1) {
    throw new Error(`b0483 precondition unmet: PIC-78 anchor '${anchor}' not found in ${CONVERSATION_DRIVE}`);
  }
  const rest = specText.slice(start + anchor.length);
  const next = rest.search(/\n(?:<a id=|#)/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The mocked `complete()` reply: the forced respond turn calls the respond tool with `payload`. */
function forcedRespondReply(payload: unknown): (typeof scripted)["queue"][number] {
  return (call) => {
    const tools = (call.context as { readonly tools?: ReadonlyArray<{ readonly name: string }> }).tools ?? [];
    const respond = tools.find((tool) => tool.name.startsWith("__theta_respond_"));
    if (respond === undefined) {
      throw new Error("b0483 harness: the forced respond dispatch carried no respond tool");
    }
    return assistantReply({
      stopReason: "toolUse",
      toolCalls: [{ id: "tc-forced", name: respond.name, arguments: payload }],
    });
  };
}

/** Settled exchanges ahead of a drifted-anchor drive (cells 23–25): the send's `turnStart` is twice this. */
const DRIFT_PRIOR_EXCHANGES = 3;

/**
 * The drifted-anchor turn: an overflow error-stop, an auto-compaction keeping
 * only the driven user entry, the post-compaction run, an abort of that run,
 * then `tail`, then the run settles idle.
 */
function driftedTurn(abortReason: Error, tail: readonly HostStep[]): TurnScript {
  return {
    steps: [
      { kind: "assistant", stopReason: "error", errorMessage: CONTEXT_OVERFLOW_ERROR },
      { kind: "compaction" },
      { kind: "retryRun" },
      { kind: "abort", reason: abortReason },
      ...tail,
      { kind: "idle" },
    ],
  };
}

/**
 * Assert the drift premise: at the first attempt's idle, the rebuilt message
 * list places the driven user entry before `turnStart`, so `thisTurnSettled`
 * over it cannot hold — the settle poll can only expire.
 */
function expectAnchorDrifted(session: HostRecoverySession): void {
  const atIdle = session.entriesAtIdle[0];
  if (atIdle === undefined) {
    throw new Error("b0483 precondition unmet: the drifted attempt never reached its idle step");
  }
  const turnStart = DRIFT_PRIOR_EXCHANGES * 2;
  const built = buildSessionContext(atIdle as never).messages as unknown as readonly Message[];
  expect(
    built.length,
    `drift premise: the compaction-rebuilt list is no longer than turnStart (${turnStart}); roles=${JSON.stringify(built.map((m) => m.role))}`,
  ).toBeLessThanOrEqual(turnStart);
  expect(
    thisTurnSettled(built, turnStart, sessionBranch(atIdle) as never),
    "drift premise: the attempt's own slice never opens at turnStart",
  ).toBe(false);
}

/**
 * Assert the split-turn premise: at the first attempt's idle, the rebuilt
 * message list has exactly `roles` — a compaction summary and no `user`
 * message — so neither `thisTurnSettled` nor a last-user anchor can locate the
 * attempt's turn.
 */
function expectSplitTurnLayout(session: HostRecoverySession, roles: readonly string[]): void {
  const atIdle = session.entriesAtIdle[0];
  if (atIdle === undefined) {
    throw new Error("b0483 precondition unmet: the split-turn attempt never reached its idle step");
  }
  const built = buildSessionContext(atIdle as never).messages as unknown as readonly Message[];
  expect(
    built.map((m) => m.role),
    "split-turn premise: the rebuilt list is the summary, the turn's kept tool rounds and the post-compaction run",
  ).toEqual(roles);
  expect(
    thisTurnSettled(built, DRIFT_PRIOR_EXCHANGES * 2, sessionBranch(atIdle) as never),
    "split-turn premise: the attempt's own slice never opens",
  ).toBe(false);
}

/**
 * The most scripted host steps allowed between the first attempt's idle and
 * the continuation send: the settle poll classifies on its first settled read,
 * far inside the 50-poll grace.
 */
const PROMPT_CLASSIFICATION_TICKS = 3;

/** Assert the continuation send followed the first attempt's idle within `PROMPT_CLASSIFICATION_TICKS`. */
function expectClassifiedPromptly(session: HostRecoverySession): void {
  const idle = session.idleTicks[0];
  const continuation = session.sendTicks[1];
  if (idle === undefined || continuation === undefined) {
    throw new Error("b0483 precondition unmet: no first-attempt idle or no continuation send was recorded");
  }
  expect(
    continuation - idle,
    `the relocated trailing turn is classified on its first settled read, not at the grace's end ` +
      `(idle at tick ${idle}, continuation at tick ${continuation})`,
  ).toBeLessThanOrEqual(PROMPT_CLASSIFICATION_TICKS);
}

/**
 * Seed an earlier turn compacted by a split-turn cut, ending in a tagged
 * error-stop: the built list then carries no `user` message before the drive's
 * own send (cell 31).
 */
function seedSplitTurnCompactedHistory(entries: SessionEntryDouble[]): void {
  appendUserEntry(entries, "earlier theta question");
  appendMessageEntry(entries, {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-earlier", name: "probe_tool", arguments: {} }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    stopReason: "toolUse",
    timestamp: 0,
  });
  const kept = entries[entries.length - 1]!.id;
  appendMessageEntry(entries, {
    role: "toolResult",
    toolCallId: "tc-earlier",
    toolName: "probe_tool",
    content: [{ type: "text", text: "tool output" }],
    isError: false,
    timestamp: 0,
  });
  appendCompactionEntry(entries, kept);
  appendAssistantEntry(entries, "earlier partial", "error", TAGGED_RETRYABLE_ERROR);
}

/** Assert the premise that the fixture errorMessage is one the host would retry. */
function expectTaggedMessageIsHostRetryable(): void {
  const probe = {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: TAGGED_RETRYABLE_ERROR,
    timestamp: 0,
  } as unknown as AssistantMessage;
  expect(
    isRetryableAssistantError(probe),
    "fixture premise: pi-ai's isRetryableAssistantError (the host's own retry classifier) must " +
      "accept the tagged watchdog errorMessage — otherwise the recovery cells are not recovery shapes",
  ).toBe(true);
}

// ===========================================================================

describe("bug 0483 — a host-recovery abort must ride the host's retry, not cancel the theta", () => {
  it("(1) idle-recovery ride (pi ≥ 0.87 shape): exactly ONE continuation send, Ok(<continuation text only>), thetaAbort never aborted — RED at HEAD: Err(cancelled)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      idleRecoveryTurn(),
      cleanTurn("continued answer after recovery"),
    ]);

    expect(out.session.abortTick, "cell premise: the watchdog abort fired mid-turn").toBeDefined();
    expect(
      out.thetaAbort.signal.aborted,
      `bug 0483: a mid-turn abort whose turn settles as a host-retryable error-stop is a HOST ` +
        `RECOVERY — thetaAbort must never be aborted; observed ${disposition(out)}`,
    ).toBe(false);
    expect(
      out.execution.outcome,
      `bug 0483 §Fix: the idle-recovery arm re-drives the turn and the query settles Ok; ` +
        `observed ${disposition(out)}`,
    ).toBe("success");
    expect(
      out.session.sends.length,
      `exactly ONE continuation send follows the original query send; sends=${JSON.stringify(out.session.sends)}`,
    ).toBe(2);
    expect(out.session.sends[0], "the first send is the rendered query").toBe(QUERY_TEXT);
    expect(
      out.session.sends[1],
      "the second send is theta's fixed continuation prompt, not a re-send of the query",
    ).toBe(PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT);
    expect(out.session.rejectedSends, "no send landed on a streaming session").toBe(0);
    expect(
      out.execution.result.value,
      "PIC-53: the value is the continuation turn's text only (the new user message re-anchors the trailing turn)",
    ).toBe("continued answer after recovery");
    expect(out.session.hostAbortCalls, "no theta cancellation → the reverse bridge never fires").toBe(0);
    // The cancel / Err notes (SLSH-3/SLSH-4) are emitted by the composition
    // root's top-level wrapper (`emitTopLevelErrNote`, reached through
    // `composeThetaFixture.run`), which this harness bypasses by calling
    // `executeBody` directly, so their absence here would prove nothing. The
    // cancellation observables are `thetaAbort` and the outcome above; the note
    // channel is asserted for what the driver itself emits: the ride note
    // alone.
    expectRideNotes(out.pi.notes, 1);
  });

  it("(2) in-run ride (pi ≤ 0.86 shape): the session stays non-idle through core retry → Ok(<retried text only>), ZERO continuation sends — RED at HEAD: Err(cancelled)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: watchdogAbortReason() },
          {
            kind: "assistant",
            stopReason: "error",
            text: "partial reply before the stall",
            errorMessage: TAGGED_RETRYABLE_ERROR,
          },
          // `_prepareRetry` → `agent.continue()`: fresh run, never idle between.
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "retried answer" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.abortTick, "cell premise: the watchdog abort fired mid-turn").toBeDefined();
    expect(
      out.thetaAbort.signal.aborted,
      `bug 0483: the in-run core retry recovered the turn — thetaAbort must never be aborted; ` +
        `observed ${disposition(out)}`,
    ).toBe(false);
    expect(
      out.execution.outcome,
      `bug 0483 §Fix ("recovered" arm): the settled turn carries retry residue and a normal final ` +
        `assistant — the query settles Ok; observed ${disposition(out)}`,
    ).toBe("success");
    expect(
      out.session.sends,
      "ZERO continuation sends: pi's own in-run retry already re-ran the turn",
    ).toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
    expect(
      out.execution.result.value,
      "PIC-53 (amended): the retried assistant's text only — the error-stop residue is excluded",
    ).toBe("retried answer");
    expect(out.session.hostAbortCalls, "no theta cancellation → the reverse bridge never fires").toBe(0);
  });

  it("(3a) user ESC preserved: abort + trailing \"aborted\" settle → Err(cancelled), thetaAbort.reason IS the source reason (CNCL-4) — GREEN before and after", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: esc },
          { kind: "assistant", stopReason: "aborted", text: "partial" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.execution.outcome, `a user ESC cancels the theta; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.aborted, "thetaAbort carries the cancellation").toBe(true);
    expect(
      out.thetaAbort.signal.reason,
      "CNCL-4: the forwarded reason is the recorded source reason, by identity",
    ).toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
  });

  it("(3b) user ESC before the first token (no assistant at all) cancels within the grace, not after the full settle bound — GREEN before and after", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      { steps: [{ kind: "abort", reason: esc }, { kind: "idle" }] },
    ]);

    expect(out.execution.outcome, `a pre-first-token ESC cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: reason identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expect(out.session.abortTick, "cell premise: the ESC abort fired").toBeDefined();
    const ticksAfterAbort = out.session.ticks - out.session.abortTick!;
    expect(
      ticksAfterAbort,
      `bug 0483 §Fix: with a recorded abort and an idle session whose slice never grows an ` +
        `assistant, a short grace classifies cancel — the drive must not sit out the ` +
        `${TURN_SETTLE_POLL_BOUND}-poll settle bound; observed ${ticksAfterAbort} polls after the abort`,
    ).toBeLessThan(TURN_SETTLE_POLL_BOUND / 2);
  });

  it("(4) ride bound: a tagged settle on EVERY attempt → after 3 continuation rides, Err(transport) carrying the tagged errorMessage, never cancelled — RED at HEAD: Err(cancelled)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      idleRecoveryTurn("attempt 1 partial"),
      idleRecoveryTurn("attempt 2 partial"),
      idleRecoveryTurn("attempt 3 partial"),
      idleRecoveryTurn("attempt 4 partial"),
    ]);

    expect(
      out.thetaAbort.signal.aborted,
      `bug 0483: a spent ride bound is a loud transport failure, never a cancellation; ` +
        `observed ${disposition(out)}`,
    ).toBe(false);
    expect(
      out.session.sends.length,
      `the original send plus exactly PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND (3) continuation sends; ` +
        `sends=${JSON.stringify(out.session.sends)}`,
    ).toBe(4);
    const leaf = expectErrOfKind(out.execution, "transport");
    expect(
      leaf.message,
      "PIC-51 maps the final tagged error-stop to Err(transport) carrying its errorMessage verbatim",
    ).toBe(TAGGED_RETRYABLE_ERROR);
    expect(
      out.session.sends.slice(1),
      "every ride sends the fixed continuation prompt",
    ).toEqual(Array.from({ length: PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND }, () => PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT));
    expectRideNotes(out.pi.notes, PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND);
  });

  it("(5) answer in hand: a typed query whose respond tool already captured a valid payload settles Ok(<payload>) on a host-recovery abort — no continuation, no off-session dispatch — RED at HEAD: Err(cancelled)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(TYPED_QUERY_THETA, [
      {
        steps: [
          { kind: "respond", payload: { score: 3 } },
          // The post-tool-result continuation request stalls; the watchdog aborts.
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.respondResults.length, "cell premise: the model called the respond tool").toBe(1);
    const respondResult = await out.session.respondResults[0]!;
    expect(
      executeResultText(respondResult),
      `cell premise: the early respond call was VALID and captured (QRY-14); observed ${JSON.stringify(respondResult)}`,
    ).toMatch(/recorded/i);
    expect(
      out.thetaAbort.signal.aborted,
      `bug 0483 §"Decided sub-case": a host-recovery abort after a captured respond is not a ` +
        `cancellation; observed ${disposition(out)}`,
    ).toBe(false);
    expect(
      out.execution.outcome,
      `bug 0483 §"Decided sub-case": the query settles on the captured payload; observed ${disposition(out)}`,
    ).toBe("success");
    expect(out.execution.result.value, "the captured respond payload is the typed value").toEqual({ score: 3 });
    expect(out.session.sends, "no continuation: the answer is already in hand").toEqual([QUERY_TEXT]);
    expect(scripted.calls.length, "zero off-session forced respond dispatches (QRY-14 early respond)").toBe(0);
  });

  it("(6) clean-settle disambiguation: a recorded abort whose turn settles on a normal boundary with NO retry residue → Err(cancelled) (ESC raced the natural end) — GREEN before and after", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: esc },
          { kind: "assistant", stopReason: "stop", text: "complete answer" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(
      out.execution.outcome,
      `a clean settle with no retry residue keeps today's cancellation; observed ${disposition(out)}`,
    ).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: reason identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
  });

  it("(7a) PIC-53 exclusion (extraction): `[user, error-stop asst(\"partial\"), stop asst(\"full\")]` → \"full\" — RED at HEAD: \"partial\\nfull\"", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: QUERY_TEXT }], timestamp: 0 },
      {
        role: "assistant",
        content: [{ type: "text", text: "partial" }],
        stopReason: "error",
        errorMessage: TAGGED_RETRYABLE_ERROR,
        timestamp: 0,
      },
      { role: "assistant", content: [{ type: "text", text: "full" }], stopReason: "stop", timestamp: 0 },
    ] as unknown as readonly Message[];

    expect(
      extractTrailingTurnText(messages),
      "bug 0483 §Fix item 3: extractTrailingTurnText skips `stopReason: \"error\"` assistant entries " +
        "(retry residue pi keeps in session history is not answer text)",
    ).toBe("full");
  });

  it("(7b) PIC-53 exclusion (driven, no abort — reachable today via core retry): the settled turn's value is the retried text only — RED at HEAD: Ok(\"partial\\nfull\")", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "assistant", stopReason: "error", text: "partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "full" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.abortTick, "cell premise: no abort is involved").toBeUndefined();
    expect(out.execution.outcome, `the retried turn settles Ok; observed ${disposition(out)}`).toBe("success");
    expect(
      out.execution.result.value,
      "bug 0483 §Fix item 3: the error-stop residue is excluded from the PIC-53 join",
    ).toBe("full");
    expect(out.session.sends, "core retry needs no theta continuation").toEqual([QUERY_TEXT]);
  });

  it("(8) agent_end gating: a post-settle aborted ctx.signal over a tagged host-retryable settle does NOT synthesise the agent_end cancel — RED at HEAD: Err(cancelled) with the synthesised reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        // The per-turn forward sees no signal; only the post-settle
        // `agent_end` synthesis site observes the aborted one.
        signalExposure: "post-settle",
        steps: [
          { kind: "abort", reason: watchdogAbortReason() },
          {
            kind: "assistant",
            stopReason: "error",
            text: "partial reply before the stall",
            errorMessage: TAGGED_RETRYABLE_ERROR,
          },
          { kind: "idle" },
        ],
      },
      // Scripted in case the fixed driver rides this settle (a recovering
      // classification); unconsumed otherwise.
      cleanTurn("continued answer after recovery"),
    ]);

    expect(out.session.abortTick, "cell premise: the watchdog abort fired mid-turn").toBeDefined();
    expect(
      out.thetaAbort.signal.aborted,
      `bug 0483 §Fix: the abortForAgentEnd synthesis is gated by the settle classification — ` +
        `skipped for a "recovering" settle; observed ${disposition(out)}`,
    ).toBe(false);
    // PIC-78: an abort observed only post-settle is classified like a recorded
    // one, so a "recovering" settle rides exactly as a recorded abort does.
    expect(
      out.execution.outcome,
      `PIC-78: the post-settle-observed recovering settle rides; observed ${disposition(out)}`,
    ).toBe("success");
    expect(out.session.sends, "exactly one continuation send follows the original query send").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expect(out.execution.result.value, "PIC-53: the continuation turn's text only").toBe(
      "continued answer after recovery",
    );
    expectRideNotes(out.pi.notes, 1);
  });
  it("(9) captured respond + a NON-retryable error-stop, no abort: the PIC-51 probe still answers Err(transport) (the captured payload pre-empts the probe only on a host-recovery settle)", async () => {
    const probe = { role: "assistant", stopReason: "error", errorMessage: NON_RETRYABLE_ERROR } as unknown as AssistantMessage;
    expect(isRetryableAssistantError(probe), "fixture premise: the host would NOT retry this errorMessage").toBe(false);
    const out = await driveLiveTheta(TYPED_QUERY_THETA, [
      {
        steps: [
          { kind: "respond", payload: { score: 3 } },
          { kind: "assistant", stopReason: "error", errorMessage: NON_RETRYABLE_ERROR },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.respondResults.length, "cell premise: the model called the respond tool").toBe(1);
    expect(out.session.abortTick, "cell premise: no abort is involved").toBeUndefined();
    const leaf = expectErrOfKind(out.execution, "transport");
    expect(leaf.message, "PIC-51 carries the trailing errorMessage verbatim").toBe(NON_RETRYABLE_ERROR);
    expect(out.thetaAbort.signal.aborted, "a transport failure is not a cancellation").toBe(false);
    expect(out.session.sends, "no continuation for a non-recovery settle").toEqual([QUERY_TEXT]);
    expect(scripted.calls.length, "no off-session respond dispatch after a transport failure").toBe(0);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(10) captured respond + a \"length\" terminator, no abort: the PIC-51b probe still answers Err(context_overflow)", async () => {
    const out = await driveLiveTheta(TYPED_QUERY_THETA, [
      {
        steps: [
          { kind: "respond", payload: { score: 3 } },
          { kind: "assistant", stopReason: "length", text: "truncated narration" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.respondResults.length, "cell premise: the model called the respond tool").toBe(1);
    expect(out.session.abortTick, "cell premise: no abort is involved").toBeUndefined();
    expectErrOfKind(out.execution, "context_overflow");
    expect(out.thetaAbort.signal.aborted, "an overflow is not a cancellation").toBe(false);
    expect(out.session.sends, "no continuation for a non-recovery settle").toEqual([QUERY_TEXT]);
    expect(scripted.calls.length, "no off-session respond dispatch after a context overflow").toBe(0);
  });

  it("(11) respond-repair restarted phase: the restarted free phase captures a valid payload, then a host-recovery abort settles it tagged -> Ok(<captured payload>), no continuation, no fresh dispatch", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      REPAIR_TYPED_QUERY_THETA,
      [
        cleanTurn("thinking done"),
        {
          steps: [
            { kind: "respond", payload: { score: 3 } },
            { kind: "abort", reason: watchdogAbortReason() },
            { kind: "assistant", stopReason: "error", errorMessage: TAGGED_RETRYABLE_ERROR },
            { kind: "idle" },
          ],
        },
      ],
      // The INITIAL forced respond turn returns an AJV-invalid payload, which
      // opens respond-repair; the repair's restarted free phase is turn 2.
      { completeQueue: [forcedRespondReply({ score: "not a number" })] },
    );

    expect(scripted.calls.length, "cell premise: exactly the initial forced respond dispatch ran").toBe(1);
    expect(out.session.sends.length, `cell premise: the original send plus the repair opener; sends=${JSON.stringify(out.session.sends)}`).toBe(2);
    expect(out.session.sends[0], "the first send is the rendered query").toBe(QUERY_TEXT);
    expect(
      out.session.sends[1],
      "the second send is the repair follow-up, never the host-recovery continuation",
    ).not.toBe(PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT);
    expect(out.session.respondResults.length, "cell premise: the restarted phase called the respond tool").toBe(1);
    expect(out.thetaAbort.signal.aborted, `a host recovery is not a cancellation; observed ${disposition(out)}`).toBe(false);
    expect(
      out.execution.outcome,
      `bug 0483 (Decided sub-case) on the repair path: the captured payload resolves the attempt; observed ${disposition(out)}`,
    ).toBe("success");
    expect(out.execution.result.value, "the restarted phase's captured payload is the typed value").toEqual({ score: 3 });
    expectRideNotes(out.pi.notes, 0);
  });

  it("(12) ESC over a run that never goes idle: the end-poll expiry resolves Err(cancelled) with the recorded reason, never a transport Err", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [{ steps: [{ kind: "abort", reason: esc }, { kind: "hang" }] }]);

    expect(out.session.abortTick, "cell premise: the ESC abort fired").toBeDefined();
    expect(out.execution.outcome, `a genuine ESC cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expect(out.session.hostAbortCalls, "the bug-0319 reverse bridge tears the stuck run down once").toBe(1);
  });

  it("(13) ESC + aborted settle whose waitForIdle() never resolves: the waitForIdle-race expiry resolves Err(cancelled) with the recorded reason, never a transport Err", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        {
          steps: [
            { kind: "abort", reason: esc },
            { kind: "assistant", stopReason: "aborted", text: "partial" },
            { kind: "idle" },
          ],
        },
      ],
      { waitForIdle: "never" },
    );

    expect(out.execution.outcome, `a genuine ESC cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
  });

  it("(14) recorded abort + tagged retry residue + a retried \"length\" terminator: not a normal-boundary settle, so not recovered -> Err(cancelled) with the recorded reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const abortReason = watchdogAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: abortReason },
          { kind: "assistant", stopReason: "error", text: "partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "length", text: "truncated retry" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(
      out.execution.outcome,
      `bug 0483: "recovered" requires a normal-boundary final assistant; a "length" terminator ` +
        `with a recorded abort cancels; observed ${disposition(out)}`,
    ).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(abortReason);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  // --- Later agent runs of one driven turn (cells 15–18) ---------------------
  // `ctx.signal` is the ACTIVE run's signal; the `retryRun` step starts a fresh
  // run (fresh controller) with the session still non-idle, the shape pi's core
  // retry, overflow compaction and a queued message all share.

  it("(15) pi ≥ 0.87 later run: core retry starts run 2, the watchdog aborts run 2, the tagged error-stop settles idle → exactly ONE ride, Ok(<continuation text>) — RED at a250d9a0: Err(transport, tagged)", async () => {
    expectTaggedMessageIsHostRetryable();
    expectHostRetryable(OVERLOADED_ERROR);
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          // Run 1: a retryable provider error with no abort; core retry re-runs.
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "retryRun" },
          // Run 2: the watchdog aborts THIS run's signal; pi ≥ 0.87 bails its
          // post-run retry after an extension abort, so the run settles idle.
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", text: "run 2 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "idle" },
        ],
      },
      cleanTurn("continued answer after recovery"),
    ]);

    expect(out.session.abortTick, "cell premise: the watchdog abort fired on run 2").toBeDefined();
    expect(
      out.thetaAbort.signal.aborted,
      `a host recovery on a later run of the turn is not a cancellation; observed ${disposition(out)}`,
    ).toBe(false);
    expect(
      out.execution.outcome,
      `PIC-78: the recorder re-arms on run 2's signal, so its tagged settle rides; observed ${disposition(out)}`,
    ).toBe("success");
    expect(out.session.sends, "exactly one continuation send follows the original query send").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expect(out.execution.result.value, "PIC-53: the continuation turn's text only").toBe(
      "continued answer after recovery",
    );
    expectRideNotes(out.pi.notes, 1);
  });

  it("(16) pi ≤ 0.86 later run: the watchdog aborts run 2 and core retry re-runs in-run (run 3) → Ok(<retried text>), ZERO rides — recovered via core retry", async () => {
    expectTaggedMessageIsHostRetryable();
    expectHostRetryable(OVERLOADED_ERROR);
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "retryRun" },
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", text: "run 2 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          // pi ≤ 0.86 retries in-run even after an extension abort.
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "retried answer" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.abortTick, "cell premise: the watchdog abort fired on run 2").toBeDefined();
    expect(out.thetaAbort.signal.aborted, `core retry recovered the turn; observed ${disposition(out)}`).toBe(false);
    expect(out.execution.outcome, `"recovered" falls through to the extraction; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.execution.result.value, "PIC-53: the retried text only, both error-stops excluded").toBe(
      "retried answer",
    );
    expect(out.session.sends, "zero continuation sends: core retry already re-ran the turn").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(17) ESC aborts run 2 (after a core retry of run 1) → Err(cancelled) with the ESC reason by identity — RED at a250d9a0: Err(transport)", async () => {
    expectHostRetryable(OVERLOADED_ERROR);
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "retryRun" },
          { kind: "abort", reason: esc },
          { kind: "assistant", stopReason: "aborted", text: "run 2 partial" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.execution.outcome, `an ESC on a later run cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(18) watchdog abort on run 1, core retry, ESC on run 2 → Err(cancelled) forwarding the LATEST recorded reason (the ESC's) — RED at a250d9a0: the watchdog's reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const watchdog = watchdogAbortReason();
    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: watchdog },
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "retryRun" },
          { kind: "abort", reason: esc },
          { kind: "assistant", stopReason: "aborted", text: "run 2 partial" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.execution.outcome, `the ESC on run 2 cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(
      out.thetaAbort.signal.reason,
      "CNCL-4: the LATEST recorded reason is forwarded — the user's ESC, not the earlier watchdog abort",
    ).toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(19) a recorded abort over a context-overflow error-stop the unanchored retry patterns accept → Err(cancelled), no ride (the host's overflow exclusion) — RED at a250d9a0: rides", async () => {
    const overflow = {
      role: "assistant",
      stopReason: "error",
      errorMessage: CONTEXT_OVERFLOW_ERROR,
    } as unknown as AssistantMessage;
    expect(
      isRetryableAssistantError(overflow),
      "fixture premise: isRetryableAssistantError alone accepts the overflow text (its patterns are unanchored)",
    ).toBe(true);
    expect(isContextOverflow(overflow, 0), "fixture premise: pi-ai classifies the text as a context overflow").toBe(
      true,
    );
    // The residue arm applies the same exclusion: overflow residue under a
    // normal final assistant is not a core-retry recovery.
    const slice = [
      { role: "user", content: [{ type: "text", text: QUERY_TEXT }], timestamp: 0 },
      overflow,
      { role: "assistant", content: [{ type: "text", text: "after compaction" }], stopReason: "stop", timestamp: 0 },
    ] as unknown as readonly Message[];
    expect(
      classifyHostRecoverySettle(slice, slice[2] as AssistantMessage, 0),
      "overflow residue is not retry residue: the host never retries an overflow",
    ).toBe("cancel");
    expect(
      classifyHostRecoverySettle(slice.slice(0, 2), overflow, 0),
      "a trailing overflow error-stop is not a host-retryable settle",
    ).toBe("cancel");

    const esc = escAbortReason();
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: esc },
          { kind: "assistant", stopReason: "error", errorMessage: CONTEXT_OVERFLOW_ERROR },
          { kind: "idle" },
        ],
      },
      // Scripted in case a ride is issued; unconsumed on the fixed tree.
      cleanTurn("continued answer after recovery"),
    ]);

    expect(out.execution.outcome, `an overflow settle is not a host recovery; observed ${disposition(out)}`).toBe(
      "cancel",
    );
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "no continuation for an overflow settle").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(20) the PIC-17 install persists across a ride: both sends see the same install vector, no setActiveTools between them, the ambient set restored after", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [idleRecoveryTurn(), cleanTurn("free-phase answer after recovery")],
      { completeQueue: [forcedRespondReply({ score: 4 })] },
    );

    expect(out.execution.outcome, `the ridden typed query settles Ok; observed ${disposition(out)}`).toBe("success");
    expect(out.execution.result.value, "the forced respond payload is the typed value").toEqual({ score: 4 });
    const events = out.pi.activeSetEvents;
    const sendIndexes = events.flatMap((event, i) => (event.kind === "send" ? [i] : []));
    expect(sendIndexes.length, `cell premise: the original send plus one continuation; events=${JSON.stringify(events)}`).toBe(2);
    const [firstSend, secondSend] = sendIndexes as [number, number];
    const between = events.slice(firstSend + 1, secondSend);
    expect(
      between,
      "PIC-78: a ride runs inside the SAME open PIC-17 window — no setActiveTools between the sends",
    ).toEqual([]);
    const installs = events.slice(0, firstSend).filter((event) => event.kind === "setActiveTools");
    expect(installs.length, `exactly one install ahead of the first send; events=${JSON.stringify(events)}`).toBe(1);
    const installVector = installs[0]!.names;
    expect(
      installVector.some((name) => name.startsWith("__theta_respond_")),
      `the install vector carries the typed query's respond tool; observed ${JSON.stringify(installVector)}`,
    ).toBe(true);
    for (const index of sendIndexes) {
      const event = events[index]!;
      expect(
        event.kind === "send" ? event.activeTools : undefined,
        "each send, the continuation included, sees the install vector",
      ).toEqual(installVector);
    }
    expect(out.pi.activeTools(), "the step-4 restore returns the ambient active set").toEqual(AMBIENT_ACTIVE_TOOLS);
  });

  it("(21) rounds add up across attempts: attempt 1 spends the whole max_rounds budget, then rides; attempt 2's tool round is BLOCKED → Err(tool_loop_exhausted)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(ONE_ROUND_BUDGET_THETA, [
      {
        steps: [
          { kind: "toolRound", toolName: "read" },
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "idle" },
        ],
      },
      {
        steps: [
          { kind: "toolRound", toolName: "read" },
          { kind: "assistant", stopReason: "stop", text: "answer after a blocked round" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.session.sends, "cell premise: the original send plus one continuation").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expectRideNotes(out.pi.notes, 1);
    expect(
      out.session.toolCallDecisions,
      "PIC-78: a ride never mints fresh round budget — attempt 1's round is allowed, attempt 2's is blocked",
    ).toEqual([undefined, { block: true, reason: TOOL_LOOP_EXHAUSTED_REASON }]);
    const leaf = expectErrOfKind(out.execution, "tool_loop_exhausted");
    expect(leaf["rounds"], "ERR-19: rounds == max_rounds").toBe(1);
    expect(leaf["last_tool_name"], "the blocked round's tool").toBe("read");
    expect(out.thetaAbort.signal.aborted, "an exhausted budget is not a cancellation").toBe(false);
  });

  it("(22) PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT is the continuation text PIC-78 specifies verbatim", () => {
    const pic78 = extractPic78(readSpec(CONVERSATION_DRIVE));
    expect(
      pic78.includes(
        `sends the fixed continuation prompt \`PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT\`, whose text is exactly \`${PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT}\``,
      ),
      "PIC-78 names the continuation constant and quotes its text byte-exact; code and spec must not drift",
    ).toBe(true);
  });

  // --- Settle-anchor drift (cells 23–25) -------------------------------------
  // The reviewer's shape: three prior exchanges, then an overflow error-stop,
  // an auto-compaction keeping only the driven user entry, the post-compaction
  // run, and an abort of THAT run. The rebuilt list is shorter than
  // `turnStart`, so the attempt's own slice never opens.

  it("(23) drifted anchor: a watchdog abort of the post-compaction run whose tagged error-stop settles idle → exactly ONE ride, Ok(<continuation text>) — RED at 53e8c200: Err(cancelled) with the watchdog reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        driftedTurn(watchdogAbortReason(), [
          {
            kind: "assistant",
            stopReason: "error",
            text: "post-compaction partial",
            errorMessage: TAGGED_RETRYABLE_ERROR,
          },
        ]),
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectAnchorDrifted(out.session);
    expect(
      out.thetaAbort.signal.aborted,
      `PIC-78: the settle-grace expiry classifies the trailing turn at PIC-51's last-user anchor; a ` +
        `recovering settle is not a cancellation; observed ${disposition(out)}`,
    ).toBe(false);
    expect(out.execution.outcome, `the drifted recovering settle rides; observed ${disposition(out)}`).toBe("success");
    expect(out.session.sends, "exactly one continuation send follows the original query send").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expect(out.execution.result.value, "PIC-53: the continuation turn's text only").toBe(
      "continued answer after recovery",
    );
    expectRideNotes(out.pi.notes, 1);
    expectClassifiedPromptly(out.session);
  });

  it("(24) drifted anchor control: an ESC of the post-compaction run whose turn settles \"aborted\" → Err(cancelled) with the ESC reason by identity", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        driftedTurn(esc, [{ kind: "assistant", stopReason: "aborted", text: "post-compaction partial" }]),
        // Scripted in case a ride is issued; unconsumed on the fixed tree.
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectAnchorDrifted(out.session);
    expect(out.execution.outcome, `a genuine ESC cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(25) drifted anchor: a watchdog abort of the post-compaction run, then core retry re-runs in-run → Ok(<retried text>), ZERO rides (\"recovered\") — RED at 53e8c200: Err(cancelled) with the watchdog reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        driftedTurn(watchdogAbortReason(), [
          {
            kind: "assistant",
            stopReason: "error",
            text: "post-compaction partial",
            errorMessage: TAGGED_RETRYABLE_ERROR,
          },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "retried answer" },
        ]),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectAnchorDrifted(out.session);
    expect(out.thetaAbort.signal.aborted, `core retry recovered the turn; observed ${disposition(out)}`).toBe(false);
    expect(out.execution.outcome, `"recovered" falls through to the extraction; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.execution.result.value, "PIC-53: the retried text only, every error-stop excluded").toBe(
      "retried answer",
    );
    expect(out.session.sends, "zero continuation sends: core retry already re-ran the turn").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(26) core-retry backoff: ctx.signal reads undefined while the session is non-idle, then the next run's watchdog abort is recorded → exactly ONE ride", async () => {
    expectTaggedMessageIsHostRetryable();
    expectHostRetryable(OVERLOADED_ERROR);
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: OVERLOADED_ERROR },
          // `_prepareRetry`'s backoff: the run handle is cleared across several polls.
          { kind: "retryBackoff" },
          { kind: "retryBackoff" },
          { kind: "retryBackoff" },
          { kind: "retryRun" },
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", text: "run 2 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "idle" },
        ],
      },
      cleanTurn("continued answer after recovery"),
    ]);

    expect(
      out.session.undefinedSignalReadsWhileActive,
      "cell premise: the end-poll read ctx.signal as undefined while the session was non-idle",
    ).toBeGreaterThan(0);
    expect(
      out.execution.outcome,
      `the recorder survives the undefined-signal gap and records run 2's abort; observed ${disposition(out)}`,
    ).toBe("success");
    expect(out.session.sends, "exactly one continuation send follows the original query send").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expect(out.execution.result.value, "PIC-53: the continuation turn's text only").toBe(
      "continued answer after recovery",
    );
    expectRideNotes(out.pi.notes, 1);
  });

  it("(27) the recorder detaches every run signal's listener: at the re-arm onto the next run and at the drive's end", async () => {
    expectHostRetryable(OVERLOADED_ERROR);
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "error", text: "run 2 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "run 3 answer" },
          { kind: "idle" },
        ],
      },
    ]);

    expect(out.execution.outcome, `cell premise: the turn settles normally; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.execution.result.value, "PIC-53: run 3's text only").toBe("run 3 answer");
    const counts = out.session.runSignals.map((tracked) => ({ added: tracked.added, removed: tracked.removed }));
    expect(counts.length, "cell premise: one driven turn spanning three agent runs").toBe(3);
    for (const [run, tracked] of out.session.runSignals.entries()) {
      expect(
        tracked.added,
        `cell premise: the recorder watched run ${run + 1}'s signal; counts=${JSON.stringify(counts)}`,
      ).toBe(1);
    }
    expect(
      out.session.maxStaleListeners,
      `a replaced run's listener is detached before the next host step; counts=${JSON.stringify(counts)}`,
    ).toBe(0);
    for (const [run, tracked] of out.session.runSignals.entries()) {
      expect(
        liveListeners(tracked),
        `run ${run + 1}'s listener is detached once the drive ends; counts=${JSON.stringify(counts)}`,
      ).toBe(0);
    }
  });

  it("(27b) the recorder detaches across a ride: attempt 1's recorder, still watching its last (unaborted) run signal, is detached before the continuation attempt's first host step", async () => {
    expectTaggedMessageIsHostRetryable();
    expectHostRetryable(OVERLOADED_ERROR);
    const out = await driveLiveTheta(ONE_QUERY_THETA, [
      {
        steps: [
          { kind: "abort", reason: watchdogAbortReason() },
          { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          // Core retry starts run 2, which ends on a retryable error-stop with
          // the retries spent: its signal is never aborted.
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "error", text: "run 2 partial", errorMessage: OVERLOADED_ERROR },
          { kind: "idle" },
        ],
      },
      cleanTurn("continued answer after recovery"),
    ]);

    expect(out.execution.outcome, `cell premise: the recovering settle rides; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.session.sends, "cell premise: the original send plus one continuation").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    const counts = out.session.runSignals.map((tracked) => ({
      added: tracked.added,
      removed: tracked.removed,
      aborted: tracked.signal.aborted,
    }));
    expect(counts.length, "cell premise: two runs in attempt 1, one in the continuation attempt").toBe(3);
    expect(
      out.session.runSignals[1]?.signal.aborted,
      `cell premise: attempt 1's last run signal is never aborted, so only a detach removes its listener; counts=${JSON.stringify(counts)}`,
    ).toBe(false);
    for (const [run, tracked] of out.session.runSignals.entries()) {
      expect(
        tracked.added,
        `cell premise: a recorder watched run ${run + 1}'s signal; counts=${JSON.stringify(counts)}`,
      ).toBe(1);
    }
    expect(
      out.session.maxStaleListeners,
      `attempt 1's listener is detached when the continuation attempt starts; counts=${JSON.stringify(counts)}`,
    ).toBe(0);
    for (const [run, tracked] of out.session.runSignals.entries()) {
      expect(
        liveListeners(tracked),
        `run ${run + 1}'s listener is detached once the drive ends; counts=${JSON.stringify(counts)}`,
      ).toBe(0);
    }
  });

  // --- Split-turn compaction (cells 28–31) -----------------------------------
  // pi's split-turn cut: the turn's own content outgrows the kept-recent
  // budget, so the compaction cut falls inside the turn and summarises the
  // driven user message away. The rebuilt list carries no `user` message;
  // the trailing turn is the list after the compaction summary.

  it("(28) split turn (pi ≥ 0.87 layout): a watchdog abort of the post-compaction run whose tagged error-stop settles idle → exactly ONE ride, Ok(<continuation text>), classified on the first settled read — RED at a4d8865d: Err(cancelled) with the watchdog reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: watchdogAbortReason() },
            {
              kind: "assistant",
              stopReason: "error",
              text: "post-compaction partial",
              errorMessage: TAGGED_RETRYABLE_ERROR,
            },
            { kind: "idle" },
          ],
        },
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectSplitTurnLayout(out.session, ["compactionSummary", "assistant", "toolResult", "assistant"]);
    expect(
      out.thetaAbort.signal.aborted,
      `PIC-78: with no user anchor and a compaction from this attempt, the list after the summary is the ` +
        `trailing turn; a recovering settle is not a cancellation; observed ${disposition(out)}`,
    ).toBe(false);
    expect(out.execution.outcome, `the split-turn recovering settle rides; observed ${disposition(out)}`).toBe("success");
    expect(out.session.sends, "exactly one continuation send follows the original query send").toEqual([
      QUERY_TEXT,
      PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
    ]);
    expect(out.execution.result.value, "PIC-53: the continuation turn's text only").toBe(
      "continued answer after recovery",
    );
    expectRideNotes(out.pi.notes, 1);
    expectClassifiedPromptly(out.session);
  });

  it("(29) split turn (pi 0.80.10 layout, overflow error-stop kept): a watchdog abort of the post-compaction run, then core retry re-runs in-run → Ok(<retried text>), ZERO rides (\"recovered\") — RED at a4d8865d: Err(cancelled) with the watchdog reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "assistant", stopReason: "error", errorMessage: CONTEXT_OVERFLOW_ERROR },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: watchdogAbortReason() },
            {
              kind: "assistant",
              stopReason: "error",
              text: "post-compaction partial",
              errorMessage: TAGGED_RETRYABLE_ERROR,
            },
            { kind: "retryRun" },
            { kind: "assistant", stopReason: "stop", text: "retried answer" },
            { kind: "idle" },
          ],
        },
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectSplitTurnLayout(out.session, [
      "compactionSummary",
      "assistant",
      "toolResult",
      "assistant",
      "assistant",
      "assistant",
    ]);
    expect(out.thetaAbort.signal.aborted, `core retry recovered the turn; observed ${disposition(out)}`).toBe(false);
    expect(out.execution.outcome, `"recovered" falls through to the extraction; observed ${disposition(out)}`).toBe(
      "success",
    );
    // PIC-53 with no user anchor reads the whole list: the kept toolUse
    // assistant contributes its empty text, every error-stop is excluded.
    expect(out.execution.result.value, "PIC-53: the retried text, every error-stop excluded").toBe(
      "\nretried answer",
    );
    expect(out.session.sends, "zero continuation sends: core retry already re-ran the turn").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(30) split turn control: an ESC of the post-compaction run whose turn settles \"aborted\" → Err(cancelled) with the ESC reason by identity", async () => {
    const esc = escAbortReason();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: esc },
            { kind: "assistant", stopReason: "aborted", text: "post-compaction partial" },
            { kind: "idle" },
          ],
        },
        // Scripted in case a ride is issued; unconsumed on the fixed tree.
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectSplitTurnLayout(out.session, ["compactionSummary", "assistant", "toolResult", "assistant"]);
    expect(out.execution.outcome, `a genuine ESC cancels; observed ${disposition(out)}`).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(esc);
    expect(out.session.sends, "a cancelled turn is never continued").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(31) a missing anchor no compaction of this attempt explains: the send's user entry never lands over an earlier split-turn compaction ending in a tagged error-stop → Err(cancelled) with the watchdog reason, no ride", async () => {
    expectTaggedMessageIsHostRetryable();
    const watchdog = watchdogAbortReason();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        { userEntry: "dropped", steps: [{ kind: "abort", reason: watchdog }, { kind: "idle" }] },
        // Scripted in case a ride is issued; unconsumed on the fixed tree.
        cleanTurn("continued answer after recovery"),
      ],
      { seed: seedSplitTurnCompactedHistory },
    );

    const atIdle = out.session.entriesAtIdle[0];
    if (atIdle === undefined) {
      throw new Error("b0483 precondition unmet: the attempt never reached its idle step");
    }
    expect(
      (buildSessionContext(atIdle as never).messages as unknown as readonly Message[]).map((m) => m.role),
      "cell premise: no user message anchors any turn; the earlier compaction's kept turn ends in a tagged error-stop",
    ).toEqual(["compactionSummary", "assistant", "toolResult", "assistant"]);
    expect(
      out.execution.outcome,
      `only a compaction from this attempt explains the missing anchor; observed ${disposition(out)}`,
    ).toBe("cancel");
    expect(out.thetaAbort.signal.reason, "CNCL-4: the recorded source reason, by identity").toBe(watchdog);
    expect(out.session.sends, "an earlier turn's settle is never ridden").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });

  // --- Typed queries after a compaction-relocated classification (32–39) ----
  // The compaction that forced the relocated read rebuilt the message list, so
  // the query window recorded at the first send no longer indexes this
  // query's turns. The forced respond and the repair restart's fresh dispatch
  // must end Err(transport) instead of replaying a stale or empty window.

  it("(32) typed, drifted anchor, relocated \"recovered\": the forced respond is NOT dispatched over the stale window → Err(transport, retryable) naming the compaction relocation — RED at 41f2fe88: dispatched, Ok(<forced payload>)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [
        driftedTurn(watchdogAbortReason(), [
          { kind: "assistant", stopReason: "error", text: "post-compaction partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "retried answer" },
        ]),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES, completeQueue: [forcedRespondReply({ score: 7 })] },
    );

    expectAnchorDrifted(out.session);
    expectRelocatedWindowRefused(out, [QUERY_TEXT], 0);
  });

  it("(33) typed, split turn, relocated \"recovered\": the forced respond is NOT dispatched over the stale window → Err(transport, retryable) — RED at 41f2fe88: dispatched, Ok(<forced payload>)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "assistant", stopReason: "error", errorMessage: CONTEXT_OVERFLOW_ERROR },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: watchdogAbortReason() },
            { kind: "assistant", stopReason: "error", text: "post-compaction partial", errorMessage: TAGGED_RETRYABLE_ERROR },
            { kind: "retryRun" },
            { kind: "assistant", stopReason: "stop", text: "retried answer" },
            { kind: "idle" },
          ],
        },
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES, completeQueue: [forcedRespondReply({ score: 7 })] },
    );

    expectSplitTurnLayout(out.session, [
      "compactionSummary",
      "assistant",
      "toolResult",
      "assistant",
      "assistant",
      "assistant",
    ]);
    expectRelocatedWindowRefused(out, [QUERY_TEXT], 0);
  });

  it("(34) typed, drifted anchor, relocated \"recovering\" then a ride whose continuation settles: the forced respond is NOT dispatched → Err(transport, retryable) — RED at 41f2fe88: dispatched, Ok(<forced payload>)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [
        driftedTurn(watchdogAbortReason(), [
          { kind: "assistant", stopReason: "error", text: "post-compaction partial", errorMessage: TAGGED_RETRYABLE_ERROR },
        ]),
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES, completeQueue: [forcedRespondReply({ score: 7 })] },
    );

    expectAnchorDrifted(out.session);
    expectRelocatedWindowRefused(out, [QUERY_TEXT, PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT], 1);
  });

  it("(35) typed, split turn, relocated \"recovering\" then a ride whose continuation settles: the forced respond is NOT dispatched → Err(transport, retryable) — RED at 41f2fe88: dispatched, Ok(<forced payload>)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: watchdogAbortReason() },
            { kind: "assistant", stopReason: "error", text: "post-compaction partial", errorMessage: TAGGED_RETRYABLE_ERROR },
            { kind: "idle" },
          ],
        },
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES, completeQueue: [forcedRespondReply({ score: 7 })] },
    );

    expectSplitTurnLayout(out.session, ["compactionSummary", "assistant", "toolResult", "assistant"]);
    expectRelocatedWindowRefused(out, [QUERY_TEXT, PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT], 1);
  });

  it("(36) typed, split turn, relocated \"recovering\" with the respond tool already captured THIS attempt: the answer in hand still wins → Ok(<captured payload>), no ride, zero dispatches", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      TYPED_QUERY_THETA,
      [
        {
          steps: [
            { kind: "respond", payload: { score: 3 } },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "abort", reason: watchdogAbortReason() },
            { kind: "assistant", stopReason: "error", errorMessage: TAGGED_RETRYABLE_ERROR },
            { kind: "idle" },
          ],
        },
        // Scripted in case a ride is issued; unconsumed on the fixed tree.
        cleanTurn("continued answer after recovery"),
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectSplitTurnLayout(out.session, ["compactionSummary", "assistant", "toolResult", "assistant"]);
    expect(executeResultText(await out.session.respondResults[0]!), "cell premise: the respond call captured").toMatch(
      /recorded/i,
    );
    expect(out.execution.outcome, `the captured payload resolves the query; observed ${disposition(out)}`).toBe("success");
    expect(out.execution.result.value, "the captured respond payload is the typed value").toEqual({ score: 3 });
    expect(out.session.sends, "no continuation: the answer is already in hand").toEqual([QUERY_TEXT]);
    expect(scripted.calls.length, "zero forced respond dispatches (QRY-14 early respond)").toBe(0);
    expectRideNotes(out.pi.notes, 0);
  });

  it("(37) typed control, no compaction: the forced respond dispatches ONCE over the query window (the query turn plus the trailing template) → Ok(<forced payload>)", async () => {
    const out = await driveLiveTheta(TYPED_QUERY_THETA, [cleanTurn("free-phase answer")], {
      priorExchanges: DRIFT_PRIOR_EXCHANGES,
      completeQueue: [forcedRespondReply({ score: 7 })],
    });

    expect(out.execution.outcome, `a clean typed query binds the forced payload; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.execution.result.value, "the forced respond payload is the typed value").toEqual({ score: 7 });
    expect(scripted.calls.length, "exactly one forced respond dispatch").toBe(1);
    const messages = (scripted.calls[0]!.context as { readonly messages: readonly Message[] }).messages;
    expect(
      messages.map((m) => m.role),
      "PIC-53 window: this query's turn only, earlier exchanges excluded, then the QRY-15 template",
    ).toEqual(["user", "assistant", "user"]);
    expect(messages[0]!.content, "the window opens at this query's own send").toEqual([{ type: "text", text: QUERY_TEXT }]);
  });

  it("(38) respond repair: the restarted free phase is classified through the relocated read, so the fresh dispatch is NOT issued → Err(transport, retryable) — RED at 41f2fe88: a second dispatch, Ok(<its payload>)", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      REPAIR_TYPED_QUERY_THETA,
      [
        cleanTurn("free-phase answer"),
        driftedTurn(watchdogAbortReason(), [
          { kind: "assistant", stopReason: "error", text: "post-compaction partial", errorMessage: TAGGED_RETRYABLE_ERROR },
          { kind: "retryRun" },
          { kind: "assistant", stopReason: "stop", text: "retried answer" },
        ]),
      ],
      {
        priorExchanges: DRIFT_PRIOR_EXCHANGES,
        completeQueue: [forcedRespondReply({ score: "not a number" }), forcedRespondReply({ score: 9 })],
      },
    );

    expect(out.session.sends.length, `cell premise: the repair restart was driven; observed ${disposition(out)}`).toBe(2);
    expect(scripted.calls.length, "only the initial forced respond was dispatched").toBe(1);
    const leaf = expectErrOfKind(out.execution, "transport");
    expect(leaf.retryable, `the relocation Err is retryable; observed ${JSON.stringify(leaf)}`).toBe(true);
    expect(String(leaf.message), "the Err names the compaction relocation").toMatch(/compaction relocated the driven turn/);
    expect(out.thetaAbort.signal.aborted, `not a cancellation; observed ${disposition(out)}`).toBe(false);
  });

  it("(39) two compaction summaries projected (a second split-turn compaction keeping the range that holds the first): the NEWEST summary opens the trailing turn, so the retry residue before the older summary is in it → \"recovered\", Ok — RED at 41f2fe88: Err(cancelled) with the watchdog reason", async () => {
    expectTaggedMessageIsHostRetryable();
    const out = await driveLiveTheta(
      ONE_QUERY_THETA,
      [
        {
          steps: [
            { kind: "toolRound", toolName: "probe_tool" },
            { kind: "abort", reason: watchdogAbortReason() },
            { kind: "assistant", stopReason: "error", text: "run 1 partial", errorMessage: TAGGED_RETRYABLE_ERROR },
            { kind: "retryRun" },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "assistant", stopReason: "error", errorMessage: CONTEXT_OVERFLOW_ERROR },
            { kind: "compaction", keep: "splitTurn" },
            { kind: "retryRun" },
            { kind: "assistant", stopReason: "stop", text: "retried answer" },
            { kind: "idle" },
          ],
        },
      ],
      { priorExchanges: DRIFT_PRIOR_EXCHANGES },
    );

    expectSplitTurnLayout(out.session, [
      "compactionSummary",
      "assistant",
      "toolResult",
      "assistant",
      "compactionSummary",
      "assistant",
      "assistant",
    ]);
    expect(out.thetaAbort.signal.aborted, `the in-run core retry recovered the turn; observed ${disposition(out)}`).toBe(
      false,
    );
    expect(out.execution.outcome, `"recovered" falls through to the extraction; observed ${disposition(out)}`).toBe(
      "success",
    );
    expect(out.session.sends, "zero continuation sends").toEqual([QUERY_TEXT]);
    expectRideNotes(out.pi.notes, 0);
  });
});

/**
 * Assert a typed query classified through the compaction-relocated read ended
 * `Err(transport)` — retryable, naming the relocation — with ZERO forced
 * respond dispatches, after exactly `sends` and `rides` ride notes.
 */
function expectRelocatedWindowRefused(out: DriveOutput, sends: readonly string[], rides: number): void {
  expect(out.session.sends, `cell premise: the driven sends; observed ${disposition(out)}`).toEqual(sends);
  expectRideNotes(out.pi.notes, rides);
  expect(
    scripted.calls.length,
    `PIC-78: no forced respond dispatch over the stale query window; observed ${JSON.stringify(
      scripted.calls.map((call) => (call.context as { readonly messages: readonly Message[] }).messages.map((m) => m.role)),
    )}`,
  ).toBe(0);
  const leaf = expectErrOfKind(out.execution, "transport");
  expect(leaf.retryable, `the relocation Err is retryable; observed ${JSON.stringify(leaf)}`).toBe(true);
  expect(String(leaf.message), "the Err names the compaction relocation").toMatch(/compaction relocated the driven turn/);
  expect(out.thetaAbort.signal.aborted, `not a cancellation; observed ${disposition(out)}`).toBe(false);
}
