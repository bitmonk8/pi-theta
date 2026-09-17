// H4b — the response-programming surface.
//
// The single input-side scripting API a harness-driven test uses to script
// what the in-process session double does. It extends H4a's minimal
// response-emission capability (streamed tokens for one prompt-mode turn) into
// the full scripted-injection surface the (a)–(e)-driven harness leaves
// consume — `H7a`, `V11f`, `V13c`, `V13d`, `V13f`, `V14b`, `V17a` — so each
// scripts against one API rather than inventing a per-leaf surface. The named
// injection points the contract must define:
//
//   (a) the sequence of assistant turns the double emits and the streamed
//       fragments per turn;
//   (b) the `tool_use` result returned for a given tool call — including an
//       `isError: true` tool-result and a mixed-success parallel `tool_use`
//       batch (the V14b tool-calls vector);
//   (c) the binder/provider-call response or failure fed to the binder path —
//       including a malformed-envelope failure and a transport-class failure
//       (taxonomy + per-invocation retry budget per
//       determinism-cancellation-failure.md §"Failure-class taxonomy"; envelope
//       schema per binder-bypass-and-envelope.md) that drive the V11f
//       per-class retry budget;
//   (d) a `tool_loop.max_rounds` round-exhaustion — the `tool_loop_exhausted`
//       outcome (queryerror-variants.md ERR-19) under the `max_rounds` round
//       semantics (frontmatter-fields-b-and-templates.md FRNT-1) (the V13c
//       ceiling vector); and
//   (e) an abort/cancellation injected at a chosen point in the drive —
//       pre-call, during an in-flight provider call, and during a budgeted
//       retry (the V11f / V17a vectors).
//
// The drive is DETERMINISTIC: it replays purely over the scripted state with no
// ambient clock, randomness, or ordering nondeterminism, so the same script
// yields byte-identical observable transcripts on every run. This is
// test-support code (Pi never loads it) and lives under `tests/`, outside the
// `src/**` mechanical gates.

/** Where in the binder drive an abort/cancellation is injected (category e). */
export type AbortPoint = "pre-call" | "in-flight" | "during-retry";

// --- H4c modeled-behaviour categories (f), (g) -------------------------------
//
// H4c extends this surface with the two scripted-injection categories whose
// authoring complexity comes from MODELLING not-yet-authored slice contracts,
// split out of H4b so the core categories (a)–(e) can ship first. They are the
// single shared scripting contract every (f)/(g)-driven harness leaf consumes —
// `V4c`, `V4f`, `V9i`, `V9o` — and the owning slices (`V4f`, `V9i`) consume
// this surface rather than redefining the modelled contracts.
//
//   (f) drive a nested `invoke(...)` child to completion — a produced final
//       value from the child invocation — surfaced as an observable
//       completed-invoke-child outcome, modelling the no-rollback completed-
//       invoke-child contract (error-model.md ERR-13; the V4f vector): an
//       `invoke` child that has already run to its terminal event remains final
//       and its produced final value is what the parent observes.
//   (g) script/observe a subagent-mode callee — a private subagent
//       `AgentSession` dispatched per the V9i subagent-mode session contract
//       (subagent.md): a fresh in-memory session is spawned (createAgentSession),
//       driven via sendUserMessage, and the outcome is extracted from the
//       TERMINAL `agent_end` event (`willRetry: false`), ignoring any
//       `willRetry: true` events that precede an automatic SDK retry (PIC-43).
//       The session's transcript is private and discarded, so its internal
//       turns are NOT surfaced as ordinary assistant fragments — the outcome is
//       a subagent-theta outcome, not a plain scripted (a) turn (the V4c vector).

/**
 * A scripted nested `invoke(...)` child run to completion (category f). The
 * child invocation produces `finalValue`; per ERR-13 (no rollback) a completed
 * invoke-child remains final and the parent observes its produced final value.
 */
export interface InvokeChildScript {
  readonly childName: string;
  readonly finalValue: string;
}

/**
 * One `agent_end` event a scripted subagent-mode callee's private session
 * emits. `willRetry: true` precedes an automatic SDK retry and does NOT resolve
 * the query (its `value` is a decoy the runtime ignores, per PIC-43); only the
 * terminal `willRetry: false` event resolves the subagent-theta outcome.
 */
export interface SubagentAgentEnd {
  readonly value: string;
  readonly willRetry: boolean;
}

/**
 * A scripted subagent-mode callee dispatch (category g), modelled on the V9i
 * subagent-mode session contract rather than a plain scripted turn: a private
 * in-memory `AgentSession` is spawned and the outcome is extracted from the
 * terminal `agent_end` event walking the `agentEnds` sequence in order.
 */
export interface SubagentCalleeScript {
  readonly thetaName: string;
  readonly agentEnds: readonly SubagentAgentEnd[];
}

/** A retry-eligible binder failure class (determinism-cancellation-failure.md). */
export type BinderFailureClass = "transport" | "malformed-envelope";

/** The terminal binder envelope discriminator (binder-bypass-and-envelope.md). */
export type BinderEnvelopeKind = "ok" | "needs_info" | "ambiguous";

/**
 * One scripted assistant turn: the streamed text fragments emitted in order,
 * and the optional parallel `tool_use` batch the turn emits (referencing
 * scripted tool results by `tool_use` id). A turn with no `toolUses` is a
 * terminating turn (the model produced a final answer).
 */
export interface AssistantTurnScript {
  readonly fragments: readonly string[];
  readonly toolUses?: readonly string[];
}

/**
 * A scripted `tool_use` result the double returns for a given tool call.
 * `isError: true` models a failed tool-result; a parallel batch lowers each
 * sibling's outcome independently.
 */
export interface ScriptedToolResult {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly content: string;
  readonly isError: boolean;
}

/** One scripted binder/provider-call outcome, consumed in order per attempt. */
export type BinderAttempt =
  | { readonly outcome: BinderEnvelopeKind }
  | { readonly outcome: BinderFailureClass };

/**
 * The deterministic observable transcript the drive emits. Every functional
 * effect a self-check asserts is one of these discriminated events.
 */
export type ResponseEvent =
  | { readonly kind: "fragment"; readonly turn: number; readonly text: string }
  | { readonly kind: "turn-end"; readonly turn: number }
  | {
      readonly kind: "tool-result";
      readonly toolUseId: string;
      readonly toolName: string;
      readonly content: string;
      readonly isError: boolean;
    }
  | { readonly kind: "binder-call"; readonly attempt: number }
  | {
      readonly kind: "binder-failure";
      readonly failureClass: BinderFailureClass;
      readonly attempt: number;
    }
  | { readonly kind: "binder-retry"; readonly failureClass: BinderFailureClass }
  | {
      readonly kind: "binder-outcome";
      readonly envelopeKind: BinderEnvelopeKind;
    }
  | {
      readonly kind: "binder-surfaced-failure";
      readonly failureClass: BinderFailureClass;
    }
  | { readonly kind: "tool-loop-exhausted"; readonly rounds: number }
  | { readonly kind: "cancelled"; readonly point: AbortPoint }
  | {
      // (f) ERR-13 completed-invoke-child: the produced final value the
      // already-run child invocation surfaces to its parent.
      readonly kind: "completed-invoke-child";
      readonly childName: string;
      readonly finalValue: string;
    }
  | {
      // (g) V9i subagent-mode callee: a private AgentSession was spawned
      // (createAgentSession) to dispatch the callee.
      readonly kind: "subagent-spawn";
      readonly thetaName: string;
    }
  | {
      // (g) V9i subagent-mode outcome: the final value extracted from the
      // terminal `agent_end` event of the private session.
      readonly kind: "subagent-theta";
      readonly thetaName: string;
      readonly finalValue: string;
    };

/**
 * The runtime MUST issue at most 3 budgeted binder ATTEMPTS per slash
 * invocation (1 initial + 1 transport-class retry + 1 malformed-envelope-class
 * retry), per determinism-cancellation-failure.md §"per-invocation retry
 * budget" (HC3-d; the bug-0481 degraded re-dispatch lives below this seam, so
 * this harness counts attempts).
 */
const MAX_BINDER_CALLS = 3;

/**
 * The response-programming surface: the single input-side scripting API. A test
 * scripts categories (a)–(e) via the chainable `script*` setters, then `drive()`
 * replays the script into a deterministic observable transcript.
 */
export class ResponseProgrammer {
  #assistantTurns: AssistantTurnScript[] = [];
  #toolLoopTurns: AssistantTurnScript[] = [];
  #toolLoopMaxRounds: number | undefined;
  #toolResults = new Map<string, ScriptedToolResult>();
  #binderAttempts: BinderAttempt[] = [];
  #abortAt: AbortPoint | undefined;
  #invokeChildren: InvokeChildScript[] = [];
  #subagentCallees: SubagentCalleeScript[] = [];

  // --- (a) assistant turns + per-turn streamed fragments -------------------

  /** Script the sequence of assistant turns and the streamed fragments per turn. */
  scriptAssistantTurns(turns: readonly AssistantTurnScript[]): this {
    this.#assistantTurns = turns.map((t) => ({ ...t }));
    return this;
  }

  // --- (b) tool_use results (incl. isError + mixed parallel batch) ---------

  /** Script the `tool_use` result the double returns for a given tool call. */
  scriptToolResult(result: ScriptedToolResult): this {
    this.#toolResults.set(result.toolUseId, { ...result });
    return this;
  }

  // --- (c) binder/provider-call responses and failures ---------------------

  /** Script the ordered per-attempt binder/provider-call outcomes. */
  scriptBinderAttempts(attempts: readonly BinderAttempt[]): this {
    this.#binderAttempts = attempts.map((a) => ({ ...a }));
    return this;
  }

  // --- (d) tool_loop.max_rounds round-exhaustion ---------------------------

  /**
   * Script a `tool_loop.max_rounds` round-exhaustion: the per-round assistant
   * turns and the `max_rounds` ceiling. A round is one assistant turn emitting
   * `tool_use` blocks and the runtime feeding their results back; reaching
   * `max_rounds` without a terminating turn produces the exhaustion observable.
   */
  scriptToolLoop(
    maxRounds: number,
    perRoundTurns: readonly AssistantTurnScript[],
  ): this {
    this.#toolLoopMaxRounds = maxRounds;
    this.#toolLoopTurns = perRoundTurns.map((t) => ({ ...t }));
    return this;
  }

  // --- (e) abort/cancellation injection ------------------------------------

  /** Inject an abort at a chosen point in the binder drive. */
  scriptAbortAt(point: AbortPoint): this {
    this.#abortAt = point;
    return this;
  }

  // --- (f) completed invoke-child (ERR-13 no-rollback) ---------------------

  /**
   * Script a nested `invoke(...)` child driven to completion. The child's
   * produced final value surfaces as the completed-invoke-child observable; the
   * already-run child remains final (no rollback, ERR-13).
   */
  scriptInvokeChild(child: InvokeChildScript): this {
    this.#invokeChildren.push({ ...child });
    return this;
  }

  // --- (g) subagent-mode callee (V9i subagent-mode session contract) -------

  /**
   * Script a subagent-mode callee dispatch. Models the V9i contract: a private
   * in-memory `AgentSession` is spawned and the outcome is read from the
   * terminal `agent_end` event, ignoring `willRetry: true` events (PIC-43).
   */
  scriptSubagentCallee(callee: SubagentCalleeScript): this {
    this.#subagentCallees.push({
      thetaName: callee.thetaName,
      agentEnds: callee.agentEnds.map((e) => ({ ...e })),
    });
    return this;
  }

  // --- deterministic replay -------------------------------------------------

  /**
   * Replay the script into the observable transcript. Pure over the scripted
   * state: no ambient clock, randomness, or async ordering — the same script
   * always yields the same event sequence. Phases run in fixed order so a
   * single program covering several categories replays identically.
   */
  drive(): ResponseEvent[] {
    const events: ResponseEvent[] = [];
    if (this.#binderAttempts.length > 0 || this.#abortAt !== undefined) {
      this.#driveBinder(events);
      // A binder abort surfaces the cancellation observable and the theta does
      // not run; short-circuit the remaining phases deterministically.
      if (this.#abortAt !== undefined) return events;
    }
    if (this.#toolLoopMaxRounds !== undefined) this.#driveToolLoop(events);
    if (this.#assistantTurns.length > 0) {
      this.#driveTurns(this.#assistantTurns, events);
    }
    // (f) completed invoke-child outcomes (ERR-13 no-rollback).
    for (const child of this.#invokeChildren) {
      this.#driveInvokeChild(child, events);
    }
    // (g) subagent-mode callee outcomes (V9i subagent-mode session contract).
    for (const callee of this.#subagentCallees) {
      this.#driveSubagentCallee(callee, events);
    }
    return events;
  }

  // --- phase implementations -----------------------------------------------

  #driveTurns(turns: readonly AssistantTurnScript[], out: ResponseEvent[]): void {
    turns.forEach((turn, index) => {
      for (const text of turn.fragments) {
        out.push({ kind: "fragment", turn: index, text });
      }
      this.#emitToolBatch(turn.toolUses ?? [], out);
      out.push({ kind: "turn-end", turn: index });
    });
  }

  /** Lower a parallel `tool_use` batch: each sibling's outcome independently. */
  #emitToolBatch(toolUses: readonly string[], out: ResponseEvent[]): void {
    for (const toolUseId of toolUses) {
      const result = this.#toolResults.get(toolUseId);
      if (result === undefined) {
        throw new Error(`no scripted tool result for tool_use id "${toolUseId}"`);
      }
      out.push({
        kind: "tool-result",
        toolUseId: result.toolUseId,
        toolName: result.toolName,
        content: result.content,
        isError: result.isError,
      });
    }
  }

  #driveToolLoop(out: ResponseEvent[]): void {
    const maxRounds = this.#toolLoopMaxRounds ?? 0;
    let round = 0;
    for (;;) {
      if (round >= maxRounds) {
        // Cap reached without a terminating turn (ERR-19 / FRNT-1).
        out.push({ kind: "tool-loop-exhausted", rounds: maxRounds });
        return;
      }
      const turn =
        this.#toolLoopTurns[round] ??
        this.#toolLoopTurns[this.#toolLoopTurns.length - 1];
      if (turn === undefined) {
        out.push({ kind: "tool-loop-exhausted", rounds: maxRounds });
        return;
      }
      for (const text of turn.fragments) {
        out.push({ kind: "fragment", turn: round, text });
      }
      const toolUses = turn.toolUses ?? [];
      this.#emitToolBatch(toolUses, out);
      out.push({ kind: "turn-end", turn: round });
      round += 1;
      // A turn with no tool_use blocks is a terminating turn — the loop ends
      // normally (no exhaustion observable).
      if (toolUses.length === 0) return;
    }
  }

  #driveBinder(out: ResponseEvent[]): void {
    // (e) abort before the binder is ever issued.
    if (this.#abortAt === "pre-call") {
      out.push({ kind: "cancelled", point: "pre-call" });
      return;
    }
    const budget: Record<BinderFailureClass, number> = {
      transport: 1,
      "malformed-envelope": 1,
    };
    let calls = 0;
    let lastFailure: BinderFailureClass | undefined;
    for (const attempt of this.#binderAttempts) {
      if (calls >= MAX_BINDER_CALLS) break;
      // (e) abort observed during a budgeted retry suppresses that retry and
      // surfaces the cancelled-binder note immediately (calls > 0 ⇒ a retry).
      if (this.#abortAt === "during-retry" && calls > 0) {
        out.push({ kind: "cancelled", point: "during-retry" });
        return;
      }
      out.push({ kind: "binder-call", attempt: calls });
      // (e) abort observed during the in-flight initial provider call.
      if (this.#abortAt === "in-flight" && calls === 0) {
        out.push({ kind: "cancelled", point: "in-flight" });
        return;
      }
      const attemptIndex = calls;
      calls += 1;

      if (attempt.outcome === "transport" || attempt.outcome === "malformed-envelope") {
        const failureClass = attempt.outcome;
        out.push({ kind: "binder-failure", failureClass, attempt: attemptIndex });
        lastFailure = failureClass;
        // Retry only if this class's budget remains AND the 3-call cap is not hit.
        if (budget[failureClass] > 0 && calls < MAX_BINDER_CALLS) {
          budget[failureClass] -= 1;
          out.push({ kind: "binder-retry", failureClass });
          continue;
        }
        // Budget exhausted for this class (or cap hit): this failure is terminal.
        break;
      }
      // Terminal envelope outcome (ok / needs_info / ambiguous).
      out.push({ kind: "binder-outcome", envelopeKind: attempt.outcome });
      return;
    }
    // Chain ended on a failure: surface the most-recent failure observed.
    if (lastFailure !== undefined) {
      out.push({ kind: "binder-surfaced-failure", failureClass: lastFailure });
    }
  }

  /**
   * (f) A completed `invoke(...)` child surfaces its produced final value. The
   * child has already run to its terminal event, so per ERR-13 it remains final
   * and the parent observes the produced value — no rollback is modelled.
   */
  #driveInvokeChild(child: InvokeChildScript, out: ResponseEvent[]): void {
    out.push({
      kind: "completed-invoke-child",
      childName: child.childName,
      finalValue: child.finalValue,
    });
  }

  /**
   * (g) Dispatch a subagent-mode callee, modelled on the V9i contract: spawn a
   * private in-memory `AgentSession` (createAgentSession), then resolve the
   * outcome from the TERMINAL `agent_end` event (`willRetry: false`), ignoring
   * any preceding `willRetry: true` events (PIC-43). The private session's
   * internal turns are not surfaced as ordinary assistant fragments — the
   * observable is a subagent-theta outcome, not a plain scripted (a) turn.
   */
  #driveSubagentCallee(callee: SubagentCalleeScript, out: ResponseEvent[]): void {
    out.push({ kind: "subagent-spawn", thetaName: callee.thetaName });
    const terminal = callee.agentEnds.find((e) => !e.willRetry);
    if (terminal === undefined) {
      // A subagent query that never reaches a terminal `agent_end` is a
      // scripting error: model it deterministically rather than hanging.
      throw new Error(
        `subagent callee "${callee.thetaName}" has no terminal agent_end (willRetry:false)`,
      );
    }
    out.push({
      kind: "subagent-theta",
      thetaName: callee.thetaName,
      finalValue: terminal.value,
    });
  }
}
