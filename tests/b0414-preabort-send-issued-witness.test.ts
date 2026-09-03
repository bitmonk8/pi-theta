// Bug 0414 — an abort observed inside the pre-send-gate window still issues the
// user-visible send: `#driveUserVisibleTurn` has no abort check between the gate
// exit and `pi.sendUserMessage`, so an Esc burst that both idles the
// ambient-busy session and aborts `ctx.signal` in one tick clears the gate
// (`#pollWhile` returns the SESSION state `isIdle()`, not the abort) and the
// drive issues a brand-new user-visible turn AFTER the theta was cancelled. The
// 0319 teardown listener never attaches (the attach guard refuses on an
// already-aborted signal), so the post-Esc run streams unattended while the
// theta settles cancelled around it.
//
// docs/bugs/0414-preabort-send-issued-run-never-torn-down.md (§Reproduction,
// §Expected behaviour, §Fix). The observable the doc pins:
//
//     outcome: cancel | sends: 1 | ctx.abort calls: 0 | drive run still streaming: true
//
// One user-visible send is issued after the abort is observed; the theta
// settles cancelled around it. Expected (§Expected): `sends: 0` — the gate exit
// observes the abort and the query answers `Err(cancelled)` with no on-session
// send (and therefore nothing to tear down). The §Fix is "one abort guard
// immediately before `this.#pi.sendUserMessage(text)`
// (production-theta-producer.ts:5456), mirroring `driveRepairAttempt`'s boundary
// abort check … the fixture asserts `sends: 0`".
//
// The reachable seam (verified against this tree):
//   - `LivePromptQueryModel.#driveUserVisibleTurn`
//     (src/extension/production-theta-producer.ts:5324) — the pre-send gate
//     `#pollWhile(() => !this.#ctx.isIdle(), PRE_SEND_GATE_POLL_BOUND)`
//     (production-theta-producer.ts:5345). `#pollWhile`
//     (production-theta-producer.ts:5609) exits its loop on
//     `this.#thetaAbort.signal.aborted` (:5610) but returns `!condition()` —
//     the SESSION state — so an abort that fires while the session simultaneously
//     goes idle yields `gateCleared === true`.
//   - the teardown-listener attach guard
//     `if (!teardownSignal.aborted)` (production-theta-producer.ts:5404): an
//     already-aborted signal attaches nothing, so `onThetaAbortTeardown`
//     (production-theta-producer.ts:5386) never calls `ctx.abort()`.
//   - `this.#pi.sendUserMessage(text)` (production-theta-producer.ts:5456) —
//     no `this.#thetaAbort.signal.aborted` check anywhere between the gate exit
//     (:5347) and this send.
//   - the bind-time forward
//     `forwardSlashCommandCancel(thetaAbort, ctx.signal)`
//     (production-theta-producer.ts:1965) turns an aborted `ctx.signal` into
//     `thetaAbort.signal.aborted`, so the Esc burst's `ctrl.abort()` reaches the
//     gate through the real production wiring.
//
// Spec: pi-integration-contract/conversation-drive.md:16 (PIC-70 — the
// cancellation short-circuit takes precedence; "each bounded wait MUST stop
// promptly on an observed abort" and the runtime "answers `Err(QueryError {
// kind: "cancelled" })`"). Stopping the wait and then issuing the send defeats
// the short-circuit's object.
//
// Harness: the bug-0288 scripted-session end-to-end pattern
// (tests/b0288-prompt-turn-completion-witness.test.ts — `createProductionProducerDeps`
// → `bindPromptConversation` → `executeBody` against an in-memory session double
// with an injected immediate-fire `Clock`, so the REAL `LivePromptQueryModel` is
// constructed; it is not exported) COMBINED with the bug-0319 `ctx.abort()` spy
// and real-`AbortController`-as-`ctx.signal` shape
// (tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts). The double is
// AMBIENT-BUSY at drive entry (the b0288 `ambientRunActive` shape — a slash
// dispatch reaching the theta from inside `prompt()`,
// agent-session.js:806/:927), and ends the ambient run at a chosen tick; in the
// witness cell it fires `ctrl.abort()` in the SAME tick.
//
// This file drives the REAL prompt-mode binding and asserts on real observables:
// the on-session send count (`session.sends`), the terminal
// `BodyExecution.outcome`, and whether the abort reached `thetaAbort` — never on
// a promise merely resolving.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// --- The user session's selected model (the bug-0288/0319 fixture model) -----

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * The tick at which the ambient run ends AND (in the witness cell) `ctrl.abort()`
 * fires — the doc's chosen instant (§Reproduction "at tick 3"). The pre-send
 * gate polls while the session is busy: tick 1, tick 2, tick 3 (ambient ends);
 * on the next poll re-check the session reads idle and the gate clears. With the
 * abort fired in tick 3, the gate clears WHILE `thetaAbort` is already aborted —
 * the boundary instant this bug is filed for.
 */
const AMBIENT_ENDS_AT_TICK = 3;

// --- The scripted turn lifecycle (bug-0288/0319 shape, reduced) --------------

/**
 * One on-session turn's scripted lifecycle in POLL INTERVALS from the send.
 * Every field is a count of injected-`Clock` ticks — the drive's poll cadence —
 * so the numbers are directly comparable with the drive's poll bounds.
 */
interface TurnScript {
  /** Polls between the send and the run becoming observably non-idle; `Infinity` = never starts. */
  readonly startsAfterPolls: number;
  /** Polls after the run starts before its assistant text is committed; `Infinity` = never. */
  readonly replyAfterPolls: number;
  /** Polls after the run starts before it goes idle again; `Infinity` = never (streams forever). */
  readonly endsAfterPolls: number;
  /** The committed assistant text (absent = the turn commits no assistant message). */
  readonly reply?: string;
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
interface TurnState {
  readonly script: TurnScript;
  polls: number;
}

/** Construction options for the ambient-busy session double. */
interface ScriptedSessionOptions {
  /** The tick on which the ambient run (active at drive entry) ends. */
  readonly ambientEndsAtTick: number;
  /**
   * A side effect fired in the SAME tick the ambient run ends. The witness cell
   * uses it to `ctrl.abort()` — the Esc burst that idles the session and aborts
   * `ctx.signal` at once. Omitted in the control cell (benign gate clearance).
   */
  readonly onAmbientEnd?: () => void;
}

/**
 * The live user-session double, driven by a per-turn lifecycle script and
 * AMBIENT-BUSY at drive entry. Combines the bug-0288 `ScriptedLiveSession`
 * (`isIdle()` mirrors the host `isIdle === !isStreaming`; one `tick()` per poll
 * interval advances the scripted lifecycle; the `ambientRunActive` shape — a run
 * this drive did NOT issue that is in flight at drive entry) with the bug-0319
 * `sends: string[]` send-attempt observable.
 *
 * The ambient run ends at `ambientEndsAtTick`, firing `onAmbientEnd` in that same
 * tick, so the pre-send gate's exit re-check can read the session idle in the
 * very tick the abort was observed.
 */
class ScriptedLiveSession {
  readonly entries: SessionEntryDouble[] = [];
  /** Every `sendUserMessage` call, in order — the user-visible send observable. */
  readonly sends: string[] = [];

  #tickCount = 0;
  #ambientRunActive = true;
  readonly #ambientEndsAtTick: number;
  readonly #onAmbientEnd: (() => void) | undefined;

  readonly #scripts: TurnScript[];
  #pending: TurnState | undefined = undefined;
  #active: TurnState | undefined = undefined;

  constructor(scripts: readonly TurnScript[], options: ScriptedSessionOptions) {
    this.#scripts = [...scripts];
    this.#ambientEndsAtTick = options.ambientEndsAtTick;
    this.#onAmbientEnd = options.onAmbientEnd;
  }

  sendUserMessage(text: string): void {
    this.sends.push(text);
    // A send issued while the host reports streaming is rejected asynchronously
    // (agent-session.js:834) and swallowed (agent-session.js:1858) — no entry,
    // no run (bug-0288 P3). In the witness cell the send lands on an IDLE
    // session (the ambient run ended in the same tick as the abort), so it takes
    // effect: it appends the user entry and marks a run active that nothing ends
    // — the orphaned run the bug describes.
    if (!this.isIdle()) {
      return;
    }
    const script = this.#scripts.shift();
    if (script === undefined) {
      // No silent skipping: a drive that issues more effective turns than the
      // cell scripted fails loudly naming the unmet precondition.
      throw new Error(
        `b0414 scripted live session: send #${this.sends.length} ('${text}') had NO scripted turn`,
      );
    }
    this.#appendUser(text);
    this.#pending = { script, polls: 0 };
  }

  isIdle(): boolean {
    return this.#active === undefined && !this.#ambientRunActive;
  }

  /** Advance the scripted lifecycle by exactly one poll interval (one tick). */
  tick(): void {
    this.#tickCount += 1;
    if (this.#ambientRunActive && this.#tickCount >= this.#ambientEndsAtTick) {
      this.#ambientRunActive = false;
      // The Esc burst's second flip lands in the SAME tick the ambient run
      // ends: the gate's exit re-check then reads the session idle while
      // `thetaAbort` is already aborted.
      this.#onAmbientEnd?.();
    }
    const active = this.#active;
    if (active !== undefined) {
      active.polls += 1;
      if (active.polls === active.script.replyAfterPolls) {
        this.#appendAssistant(active.script.reply);
      }
      if (active.polls >= active.script.endsAfterPolls) {
        this.#active = undefined;
      }
      return;
    }
    const pending = this.#pending;
    if (pending !== undefined) {
      pending.polls += 1;
      if (pending.polls >= pending.script.startsAfterPolls) {
        this.#pending = undefined;
        this.#active = { script: pending.script, polls: 0 };
      }
    }
  }

  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string | undefined): void {
    this.#append({
      role: "assistant",
      content: text !== undefined ? [{ type: "text", text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

// --- Harness (bug-0288/0319 shape) -------------------------------------------

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * The runtime root. The immediate-fire clock (the bug-0288 shape) advances the
 * session double by exactly one tick per poll and fires the callback
 * synchronously: `macrotask` (production-theta-producer.ts:5671) is `#pollWhile`'s
 * only wait primitive, so the drive's poll count and the double's lifecycle
 * clock are the same clock. No real timers, no network, no provider.
 */
function rootDouble(session: ScriptedLiveSession): RuntimeRoot {
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

function piDouble(session: ScriptedLiveSession): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}

/** The `ctx` double this bug pins: a real `ctx.signal` and a spied unwrapped `ctx.abort()`. */
interface CtxDoubleOptions {
  /**
   * The per-handler `ctx.signal` (the Esc source). The production bind forwards
   * it into `thetaAbort` at bind time (`forwardSlashCommandCancel`,
   * production-theta-producer.ts:1965), so aborting it flips
   * `thetaAbort.signal.aborted`.
   */
  readonly signal: AbortSignal;
  /** The unwrapped, Pi-supplied `ExtensionCommandContext.abort()` — the 0319 teardown seam. */
  readonly abort: () => void;
}

function ctxDouble(session: ScriptedLiveSession, options: CtxDoubleOptions): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: options.signal,
    abort: options.abort,
    isIdle: (): boolean => session.isIdle(),
    // Resolves immediately — the faithful limiting case (bug-0288 P5); keeps
    // every cell FINITE so no assertion can be discharged by a hang.
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

interface DriveOptions {
  /** The real `AbortController` whose `.signal` is `ctx.signal` (the Esc source). */
  readonly ctxSignal: AbortSignal;
  /** The spied unwrapped `ctx.abort()`. */
  readonly ctxAbort: () => void;
  /**
   * The externally-held `thetaAbort` the production bind reuses
   * (`bindInput.thetaAbort`, production-theta-producer.ts:1956) — held so the
   * test can confirm the `ctx.signal → thetaAbort` forward actually fired.
   */
  readonly thetaAbort: AbortController;
  readonly ambientEndsAtTick: number;
  /** Same-tick side effect when the ambient run ends (the witness cell's `ctrl.abort()`). */
  readonly onAmbientEnd?: () => void;
}

/** Drive a fixture theta through the production prompt-mode binding. */
async function driveLiveTheta(
  source: string,
  scripts: readonly TurnScript[],
  opts: DriveOptions,
): Promise<{ readonly execution: BodyExecution; readonly session: ScriptedLiveSession }> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new ScriptedLiveSession(scripts, {
    ambientEndsAtTick: opts.ambientEndsAtTick,
    ...(opts.onAmbientEnd !== undefined ? { onAmbientEnd: opts.onAmbientEnd } : {}),
  });
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(session),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: ctxDouble(session, { signal: opts.ctxSignal, abort: opts.ctxAbort }),
    thetaAbort: opts.thetaAbort,
  });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session };
}

// --- The driven theta --------------------------------------------------------
// The one-query prompt theta of the bug doc §Reproduction. `@`Ping`?` unwinds an
// `Err` out of the body via `?`, so a cancelled query settles the `cancel`
// terminal outcome (statement-executor.ts:1220, `Err(cancelled)` → `flow:
// "cancel"`) — the shape the doc's §Reproduction prints as `outcome: cancel`.

const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

/**
 * The orphaned run the post-abort send would start: it begins one poll after the
 * send and never settles. In the witness cell no tick fires after the abort (the
 * drive's remaining `#pollWhile`s short-circuit on the aborted signal,
 * production-theta-producer.ts:5610), so this run is never advanced — the point
 * is only that the send RECORDS, not what the run does afterward.
 */
const ORPHAN_SCRIPT: readonly TurnScript[] = [
  {
    startsAfterPolls: 1,
    replyAfterPolls: Number.POSITIVE_INFINITY,
    endsAfterPolls: Number.POSITIVE_INFINITY,
  },
];

/** The benign turn the control cell's gate clearance drives to a clean settle. */
const CONTROL_REPLY = "pong answer";
const SETTLING_SCRIPT: readonly TurnScript[] = [
  { startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: CONTROL_REPLY },
];

// ===========================================================================
// WITNESS cell — RED at fork, for the filed reason: an abort observed inside
// the pre-send-gate window still issues the user-visible send.
// ===========================================================================

describe("bug 0414 (RED) — an abort observed at the pre-send gate must not issue the send", () => {
  it("(a) the Esc burst idles the ambient-busy session AND aborts ctx.signal in one tick: the gate clears, but the abort MUST short-circuit the send — at fork one post-cancel send is issued", async () => {
    const ctrl = new AbortController();
    const thetaAbort = new AbortController();
    let ctxAbortCalls = 0;

    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, ORPHAN_SCRIPT, {
      ctxSignal: ctrl.signal,
      ctxAbort: (): void => {
        ctxAbortCalls += 1;
      },
      thetaAbort,
      ambientEndsAtTick: AMBIENT_ENDS_AT_TICK,
      // The Esc burst: end the ambient run (gate exit condition) AND abort
      // `ctx.signal` in the same tick. The bind-time `forwardSlashCommandCancel`
      // (production-theta-producer.ts:1965) turns the `ctx.signal` abort into a
      // `thetaAbort` abort.
      onAmbientEnd: (): void => {
        ctrl.abort(new Error("Esc"));
      },
    });

    // The forward fired: proving the abort reached the seam the gate gates on.
    // Without this the abort would never reach `thetaAbort` and the cell would
    // be meaningless (the gate would just clear benignly, like the control).
    expect(
      thetaAbort.signal.aborted,
      "the ctx.signal → thetaAbort bind-time forward must have fired — the abort has to reach the " +
        "signal the pre-send gate and every checkpoint gate on, or this cell proves nothing",
    ).toBe(true);

    // The theta settled cancelled: the `?` unwinds `Err(cancelled)` (the abort
    // short-circuit, honoured by `extractPromptModeQueryResult`) to the `cancel`
    // terminal outcome. True at fork AND post-fix — so the RED below reads
    // exactly as "a send was issued even though the theta settled cancelled",
    // not as an unrelated error.
    expect(
      execution.outcome,
      `the aborted query settles the cancel terminal outcome; observed error ${JSON.stringify(
        execution.error,
      )}`,
    ).toBe("cancel");

    // THE LOAD-BEARING WITNESS (§Expected: `sends: 0`). At fork the drive issues
    // ONE post-cancel user-visible send (`sends.length === 1`) because
    // `#driveUserVisibleTurn` has no `thetaAbort.signal.aborted` check between
    // the gate exit and `pi.sendUserMessage` (production-theta-producer.ts:5456).
    // Post-fix the one guard before the send observes the abort and returns —
    // no on-session send, nothing to tear down.
    expect(
      session.sends.length,
      "bug 0414 (PIC-70): an abort observed at the pre-send gate MUST NOT issue the user-visible " +
        `send — the gate exists so the send lands only into a state the driver still wants; ` +
        `observed sends: ${JSON.stringify(session.sends)}`,
    ).toBe(0);

    // Informative (deterministic, GREEN both directions): the run the post-abort
    // send starts is never torn down — the 0319 teardown listener refuses to
    // attach on an already-aborted signal, so `ctx.abort()` is never called for
    // this turn (the doc's `ctx.abort calls: 0`). Once the send is guarded away
    // (post-fix) there is likewise no run and no `ctx.abort()`.
    expect(
      ctxAbortCalls,
      "the pre-abort send's run is never torn down via ctx.abort() (the attach guard skips the " +
        "listener on an already-aborted signal); post-fix there is no run to tear down either",
    ).toBe(0);
  });
});

// ===========================================================================
// CONTROL cell — GREEN at fork AND post-fix. The SAME ambient-busy gate shape
// WITHOUT the abort: the ambient run ends and the gate clears benignly, so the
// drive DOES issue its one send and the scripted turn settles. This proves the
// witness reds are the abort-specific defect, not a harness that never sends
// (guards a fix that would over-fire and suppress benign busy-gate sends).
// ===========================================================================

describe("bug 0414 (CONTROL) — a benign busy-gate clearance still issues the one send and settles", () => {
  it("(b) the ambient run ends at the gate with NO abort: the gate clears, the drive issues its one send, and the turn settles Ok", async () => {
    const ctrl = new AbortController();
    const thetaAbort = new AbortController();
    let ctxAbortCalls = 0;

    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, SETTLING_SCRIPT, {
      ctxSignal: ctrl.signal,
      ctxAbort: (): void => {
        ctxAbortCalls += 1;
      },
      thetaAbort,
      ambientEndsAtTick: AMBIENT_ENDS_AT_TICK,
      // No `onAmbientEnd`: the ambient run ends with NO `ctrl.abort()`.
    });

    // The cell's premise: no abort ever reached the drive.
    expect(
      thetaAbort.signal.aborted,
      "the control cell fires no abort — the gate clears benignly",
    ).toBe(false);
    expect(ctxAbortCalls, "a non-cancelled drive never fires the reverse teardown listener").toBe(0);

    // The drive DOES send on a benign busy-gate clearance, and the turn settles.
    expect(
      session.sends.length,
      `a benign busy-gate clearance issues exactly one send; observed sends: ${JSON.stringify(
        session.sends,
      )}`,
    ).toBe(1);
    expect(
      execution.outcome,
      `a settled turn must succeed; error ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "the settled slice's assistant text is the query's value (PIC-53)",
    ).toBe(CONTROL_REPLY);
  });
});
