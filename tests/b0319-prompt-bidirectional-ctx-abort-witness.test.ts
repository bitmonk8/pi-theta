// Bug 0319 — the prompt-mode BIDIRECTIONAL cancellation bridge
// (`thetaAbort.abort()` → the unwrapped, Pi-supplied `ctx.abort()`) is
// implemented nowhere: no production path ever calls the captured
// `ExtensionCommandContext`'s `abort()`, so a `thetaAbort` fired mid-driven-turn
// leaves the live user run streaming after the theta has already settled
// cancelled, and an abort landing in the settle-phase `waitForIdle` race sits
// out the full `WAIT_FOR_IDLE_BOUND_MS` because that race carries no abort leg.
//
// docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md
// (§Expected behaviour, §Fix). Spec-pinned contract, verbatim:
//
//   cancellation.md §"Forwarding into `thetaAbort`" (docs/spec_topics/cancellation.md:9):
//     "Forwarding is also bidirectional in prompt mode: when
//     `thetaAbort.abort()` fires while a prompt-mode user turn is in flight, the
//     runtime calls the unwrapped, Pi-supplied `abort()` on the captured
//     `ExtensionCommandContext` — not the synthesised tool-execution
//     `ExtensionContext` … — to tear down the user run and unblock
//     `await ctx.waitForIdle()`. The propagation is guarded by a one-shot flag
//     so a re-entrant `thetaAbort.abort()` does not double-cancel."
//   cancellation.md §"Forwarding-listener throw" (docs/spec_topics/cancellation.md:15):
//     a throw from the forwarding listener "is trapped at the listener boundary …
//     The trap MUST NOT swallow the cancellation itself".
//   conversation-drive.md §"Hang handling"
//     (docs/spec_topics/pi-integration-contract/conversation-drive.md:16):
//     "`thetaAbort.abort()` invokes the unwrapped, Pi-supplied `abort()` on the
//     raw `ExtensionCommandContext` … which cancels the active user run and lets
//     `waitForIdle()` resolve; the runtime guards the propagation with a
//     one-shot flag". PIC-70: "each bounded wait MUST stop promptly on an
//     observed abort rather than sitting out its full bound."
//
// The single reachable seam is `LivePromptQueryModel.#driveUserVisibleTurn`
// (src/extension/production-theta-producer.ts:5082) — every driven user-visible
// turn (untyped round-0, typed free phase, live repair, degraded arm) funnels
// through it. `this.#ctx` is the RAW Pi-supplied `ExtensionCommandContext`;
// `this.#ctx.abort()` is the unwrapped abort the spec names. At fork:
//   - the ONLY ctx↔thetaAbort wiring is the ONE-DIRECTION forward
//     `forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal)`
//     (production-theta-producer.ts:5192) — ctx.signal → thetaAbort, never the
//     reverse. No `thetaAbort.signal` listener ever reaches Pi's `ctx.abort()`.
//   - the settle-phase race
//     `Promise.race([this.#ctx.waitForIdle().then(…), idleBound.then(…)])`
//     (production-theta-producer.ts:5223 through :5236) has NO abort leg, so an
//     abort landing there waits out `WAIT_FOR_IDLE_BOUND_MS` (2000 ms,
//     production-theta-producer.ts:5337) ÷ `POLL_INTERVAL_MS` (10,
//     production-theta-producer.ts:5314) ≈ 200 poll intervals.
//   - the read-side gate `#pollWhile`
//     (production-theta-producer.ts:5284, whose loop condition at :5285 includes
//     `!this.#thetaAbort.signal.aborted`) is the COMPENSATING exit that keeps
//     the theta's own `Result` answering `cancel` promptly — so the divergence
//     is invisible on the outcome surface and only the missing `ctx.abort()`
//     call and the ~200-tick settle-race sit-out witness it.
//
// The cells encode the §Expected/§Fix contract, NOT fork behaviour:
//   (A) an abort landing while a driven turn is in flight calls the unwrapped
//       `ctx.abort()` at least once — RED at fork (0 calls).
//   (B) a re-entrant double-abort calls it EXACTLY once — RED at fork (0 calls).
//   (C) an abort landing while NO turn is in flight NEVER calls `ctx.abort()`
//       (the in-flight-only scoping / unrelated-run guard) — GREEN at fork,
//       MUST stay green.
//   (D) the settle-phase `waitForIdle` race resolves PROMPTLY on the abort
//       instead of sitting out `WAIT_FOR_IDLE_BOUND_MS` — RED at fork (~200-tick
//       sit-out via injected-Clock tick accounting).
//   (E) a throw from the `ctx.abort()` listener does not crash the drive and
//       does not swallow the cancellation (fixed behaviour; vacuously green at
//       fork where the listener does not exist).
//   (F) the existing ctx.signal → thetaAbort forward direction still settles
//       cancel without crashing when the reverse listener double-fires (control).
//   (G) a non-cancelled drive never touches `ctx.abort()` and settles Ok — the
//       attach/detach must leave the happy path byte-identical (GREEN both).
//
// Harness: the bug-0288 scripted-session pattern
// (tests/b0288-prompt-turn-completion-witness.test.ts) — drive the REAL
// producer (`createProductionProducerDeps` → `bindPromptConversation` →
// `executeBody`) so the REAL `LivePromptQueryModel` is constructed (never
// hand-built; it is not exported). Two deliberate departures from the 0288
// harness, both forced by cell (D):
//   1. The clock is a VIRTUAL-TIME clock, not 0288's immediate-fire clock.
//      0288's `setTimeout(fn) => { session.tick(); fn() }` fires EVERY timer in
//      one tick, which collapses the idleBound's 2000 ms to a single tick and
//      makes the settle-race sit-out unobservable. Here every scheduled timer
//      carries a virtual due-time; an external pump advances virtual time in
//      `POLL_INTERVAL_MS` quanta (one quantum == one `session.tick()` == one
//      poll interval, exactly as 0288), firing due timers, so the idleBound
//      (2000 ms) genuinely costs ≈200 quanta relative to a poll's 10 ms. The
//      pump is the drive's only wait primitive (`macrotask`,
//      production-theta-producer.ts:5346), so the poll count and the double's
//      lifecycle clock stay the same clock.
//   2. The `ctx` double carries an `abort()` SPY (bug 0319's whole subject).
//
// This file drives the REAL prompt-mode binding and asserts on real
// observables: the `ExtensionCommandContext.abort()` call count, the terminal
// `BodyExecution.outcome`, and injected-Clock quantum accounting — never on a
// promise merely resolving.

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

// --- The user session's selected model (the bug-0288 fixture model) ----------

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** The injected-Clock poll cadence the drive uses (production-theta-producer.ts:5314). */
const POLL_INTERVAL_MS = 10;

/** The abort-blind settle-race bound at fork (production-theta-producer.ts:5337). */
const WAIT_FOR_IDLE_BOUND_MS = 2000;

/**
 * The settle-race sit-out at fork, in poll-interval quanta:
 * `WAIT_FOR_IDLE_BOUND_MS / POLL_INTERVAL_MS` ≈ 200. Cell (D) asserts the abort
 * resolves the race in FAR fewer quanta than this. The budget is generous —
 * an order of magnitude below the fork sit-out — so it reds only on the missing
 * abort leg, not on incidental poll churn.
 */
const SETTLE_RACE_TICK_BUDGET = 20;

/** The reachable `session_shutdown` sub-step-2 abort reason shape (bug doc §Reproduction 4). */
function shutdownReason(): Error {
  return new Error("theta cancelled by session shutdown");
}

// --- The scripted turn lifecycle (bug-0288 shape, reduced) -------------------

/**
 * One on-session turn's scripted lifecycle in POLL INTERVALS from the send.
 * Every field is a count of virtual-clock quanta — the drive's poll cadence —
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
  /** The turn commits its user entry AND reply inside the send and never holds a run. */
  readonly instantSettle?: boolean;
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

/**
 * The live user-session double, driven by a per-turn lifecycle script. Copied
 * from `tests/b0288-prompt-turn-completion-witness.test.ts`'s
 * `ScriptedLiveSession` and reduced to the fields bug 0319 reads:
 * `isIdle()` mirrors the host (`isIdle === !isStreaming`), and one
 * `session.tick()` per poll interval advances the scripted lifecycle.
 */
class ScriptedLiveSession {
  readonly entries: SessionEntryDouble[] = [];
  /** Every `sendUserMessage` call, in order (the send-attempt observable). */
  readonly sends: string[] = [];

  readonly #scripts: TurnScript[];
  #pending: TurnState | undefined = undefined;
  #active: TurnState | undefined = undefined;

  constructor(scripts: readonly TurnScript[]) {
    this.#scripts = [...scripts];
  }

  sendUserMessage(text: string): void {
    this.sends.push(text);
    // A send issued while the host reports streaming is rejected asynchronously
    // (agent-session.js:834) and swallowed (agent-session.js:1858) — no entry,
    // no run (bug-0288 P3). The bug-0319 cells never issue a mid-stream send
    // (the pre-send gate holds), so this arm only guards the invariant.
    if (!this.isIdle()) {
      return;
    }
    const script = this.#scripts.shift();
    if (script === undefined) {
      // No silent skipping: a drive that issues more effective turns than the
      // cell scripted fails loudly naming the unmet precondition.
      throw new Error(
        `b0319 scripted live session: send #${this.sends.length} ('${text}') had NO scripted turn`,
      );
    }
    this.#appendUser(text);
    if (script.instantSettle === true) {
      this.#appendAssistant(script.reply);
      return;
    }
    this.#pending = { script, polls: 0 };
  }

  isIdle(): boolean {
    return this.#active === undefined;
  }

  /** Advance the scripted lifecycle by exactly one poll interval (one quantum). */
  tick(): void {
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

// --- The virtual-time clock (bug 0319's departure from 0288's immediate-fire) -
//
// Why not 0288's `setTimeout(fn) => { session.tick(); fn() }`: that fires every
// timer in a single tick, so the settle-phase idleBound (a lone
// `setTimeout(resolve, 2000)`) resolves in ONE tick regardless of the abort —
// making cell (D)'s ≈200-tick sit-out unobservable. Here every timer carries a
// virtual due-time and only fires once the pump's virtual `now` reaches it.

interface PendingTimer {
  readonly due: number;
  readonly fn: () => void;
  readonly seq: number;
}

class VirtualClock {
  now = 0;
  /** Quanta advanced == poll intervals elapsed == `session.tick()` calls. */
  quanta = 0;
  #seq = 0;
  readonly #timers = new Map<number, PendingTimer>();

  /**
   * Schedule a timer at `now + ms`. `ms` defaults to `POLL_INTERVAL_MS` (a
   * `macrotask` poll), so a poll fires on the next quantum and the 2000 ms
   * idleBound fires ≈200 quanta out — the fork sit-out cell (D) witnesses.
   */
  setTimeout(fn: () => void, ms: number = POLL_INTERVAL_MS): number {
    const seq = (this.#seq += 1);
    this.#timers.set(seq, { due: this.now + ms, fn, seq });
    return seq;
  }

  clearTimeout(id: number): void {
    this.#timers.delete(id);
  }

  /** Advance virtual time by one poll interval (one quantum). */
  advance(): void {
    this.now += POLL_INTERVAL_MS;
    this.quanta += 1;
  }

  /** Fire every timer whose due time has arrived, in due order (ties by seq). */
  fireDue(): void {
    const due = [...this.#timers.values()]
      .filter((t) => t.due <= this.now)
      .sort((a, b) => a.due - b.due || a.seq - b.seq);
    for (const timer of due) {
      this.#timers.delete(timer.seq);
      timer.fn();
    }
  }
}

/** Drain the entire real microtask queue so the drive can react to a fired timer. */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// --- Harness (bug-0288 shape) ------------------------------------------------

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

function rootDouble(clock: VirtualClock): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => clock.now,
      wallNow: (): number => clock.now,
      setTimeout: (fn: () => void, ms?: number): unknown => clock.setTimeout(fn, ms),
      clearTimeout: (id: unknown): void => clock.clearTimeout(id as number),
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

/** Shape of the `ctx` double this bug pins: `abort()` is the spied unwrapped Pi abort. */
interface CtxDoubleOptions {
  /** The unwrapped, Pi-supplied `ExtensionCommandContext.abort()` — the seam bug 0319 pins. */
  readonly abort: () => void;
  /**
   * When true, `waitForIdle()` returns a promise that NEVER resolves — the cell
   * (D) shape that forces the settle-race to depend on its abort leg (post-fix)
   * or its idleBound (fork).
   */
  readonly waitForIdleNever?: boolean;
  /** The per-handler `ctx.signal` (cell (F) drives the existing forward direction through it). */
  readonly signal?: AbortSignal;
}

function ctxDouble(session: ScriptedLiveSession, options: CtxDoubleOptions): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: options.signal,
    abort: options.abort,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> =>
      options.waitForIdleNever === true ? new Promise<void>(() => {}) : Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** Loud cap so a drive that never settles fails as a diagnosable timeout, not a hang. */
const MAX_PUMP_QUANTA = 4000;

interface DriveOutput {
  readonly execution: BodyExecution;
  /** Total virtual quanta the pump advanced before the drive settled. */
  readonly settleQuantum: number;
  readonly session: ScriptedLiveSession;
}

/**
 * Drive a fixture theta through the production prompt-mode binding, pumping the
 * virtual clock one quantum at a time until `executeBody` settles.
 *
 * `onQuantum(q, session)` runs each quantum AFTER `session.tick()` and BEFORE
 * `clock.fireDue()`, so an abort fired from it is visible to the drive's poll
 * condition on the very timer this quantum releases (the drive's next
 * `#pollWhile` iteration observes `thetaAbort.signal.aborted`).
 */
async function driveLiveTheta(
  source: string,
  scripts: readonly TurnScript[],
  opts: {
    readonly ctx: CtxDoubleOptions;
    readonly thetaAbort: AbortController;
    readonly onQuantum?: (quantum: number, session: ScriptedLiveSession) => void;
  },
): Promise<DriveOutput> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new ScriptedLiveSession(scripts);
  const clock = new VirtualClock();
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(clock),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  // The externally-held `thetaAbort` (ConversationBindInput.thetaAbort,
  // theta-composition-producer.ts:193) — the controller the runtime must (post
  // fix) listen on to reach `ctx.abort()`. `bindPromptConversation` reuses it
  // rather than minting a fresh one (production-theta-producer.ts:1857).
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: ctxDouble(session, opts.ctx),
    thetaAbort: opts.thetaAbort,
  });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session)",
  ).toBe("prompt-user-session");

  let settled = false;
  let execution: BodyExecution | undefined;
  let rejection: unknown;
  const done = executeBody(theta.body, binding.executeDeps).then(
    (value) => {
      execution = value;
      settled = true;
    },
    (error) => {
      rejection = error;
      settled = true;
    },
  );

  while (!settled) {
    if (clock.quanta >= MAX_PUMP_QUANTA) {
      throw new Error(
        `b0319 pump exceeded ${MAX_PUMP_QUANTA} quanta without the drive settling — ` +
          "the harness never reached a terminal state (unmet precondition: the scripted " +
          "drive must settle on the injected Clock)",
      );
    }
    clock.advance();
    session.tick();
    opts.onQuantum?.(clock.quanta, session);
    clock.fireDue();
    await drainMicrotasks();
  }
  await done;
  // executeBody must not REJECT — a fail-closed prompt drive surfaces failures
  // as `BodyExecution` values, never throws (cell (E) leans on this). A
  // rejection here is itself the observable and must surface loudly.
  if (rejection !== undefined) {
    throw rejection instanceof Error
      ? rejection
      : new Error(`executeBody rejected with a non-Error: ${JSON.stringify(rejection)}`);
  }
  expect(execution, "executeBody must resolve a BodyExecution").toBeDefined();
  return { execution: execution!, settleQuantum: clock.quanta, session };
}

// --- The driven thetas -------------------------------------------------------

const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

/**
 * A turn that starts streaming after one poll and NEVER settles — the mid-turn
 * shape (cells A, B, E, F). The run is observably in flight when the abort lands.
 */
const MID_TURN_SCRIPT: readonly TurnScript[] = [
  {
    startsAfterPolls: 1,
    replyAfterPolls: Number.POSITIVE_INFINITY,
    endsAfterPolls: Number.POSITIVE_INFINITY,
  },
];

/**
 * Fire `thetaAbort.abort(reason)` exactly once, on the first quantum at/after
 * `atQuantum` where the run is observably streaming (`!isIdle()`), recording
 * the quantum it fired on. Fail loudly if the run is never observed streaming.
 */
function midTurnAbortHook(thetaAbort: AbortController, record: { quantum: number }): {
  onQuantum: (q: number, session: ScriptedLiveSession) => void;
  assertFired: () => void;
} {
  const atQuantum = 4;
  return {
    onQuantum: (q, session): void => {
      if (record.quantum === -1 && q >= atQuantum && !session.isIdle()) {
        record.quantum = q;
        thetaAbort.abort(shutdownReason());
      }
    },
    assertFired: (): void => {
      expect(
        record.quantum,
        "the cell's premise: the abort must land while the driven run is observably streaming — " +
          "if it never fired the harness did not reach the in-flight seam",
      ).toBeGreaterThan(0);
    },
  };
}

// ===========================================================================
// Bug 0319 — the bidirectional bridge: `thetaAbort.abort()` (mid driven turn)
// MUST reach the unwrapped, Pi-supplied `ctx.abort()`.
// ===========================================================================

describe("bug 0319 — prompt-mode thetaAbort.abort() must tear down the user run via ctx.abort()", () => {
  it("(A) a mid-turn thetaAbort.abort() calls the unwrapped ctx.abort() and settles cancel — RED at fork: no production path calls ExtensionCommandContext.abort()", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    const record = { quantum: -1 };
    const hook = midTurnAbortHook(thetaAbort, record);

    const { execution } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: { abort: () => { ctxAbortCalls += 1; } },
      thetaAbort,
      onQuantum: hook.onQuantum,
    });

    hook.assertFired();
    // The core witness. At fork `ctxAbortCalls === 0` — the reverse listener is
    // implemented nowhere (bug doc §Kind element 2), so the run the theta issued
    // keeps streaming after the invocation settled cancelled. cancellation.md:9:
    // the runtime "calls the unwrapped, Pi-supplied `abort()` on the captured
    // `ExtensionCommandContext` … to tear down the user run".
    expect(
      ctxAbortCalls,
      "bug 0319: a thetaAbort fired while a prompt-mode user turn is in flight MUST call the " +
        "unwrapped ctx.abort() to tear down the run; at fork no production path calls it",
    ).toBeGreaterThanOrEqual(1);
    // The theta's own Result still answers cancel promptly (the compensating
    // `#pollWhile` gate, production-theta-producer.ts:5284-5285) — this stays true
    // both before and after the fix and pins that the fix does not regress it.
    expect(
      execution.outcome,
      `an aborted in-flight query settles the cancel terminal outcome; observed error ` +
        `${JSON.stringify(execution.error)}`,
    ).toBe("cancel");
  });

  it("(B) a re-entrant double thetaAbort.abort() calls ctx.abort() EXACTLY once (one-shot guard) — RED at fork (0 calls)", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    let fired = false;
    let abortQuantum = -1;

    const { execution } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: { abort: () => { ctxAbortCalls += 1; } },
      thetaAbort,
      onQuantum: (q, session): void => {
        if (!fired && q >= 4 && !session.isIdle()) {
          fired = true;
          abortQuantum = q;
          // Back-to-back re-entrant aborts: the one-shot flag cancellation.md:9
          // pins ("a re-entrant `thetaAbort.abort()` does not double-cancel")
          // MUST collapse these to a single ctx.abort() call.
          thetaAbort.abort(shutdownReason());
          thetaAbort.abort(shutdownReason());
        }
      },
    });

    expect(
      abortQuantum,
      "the cell's premise: the double-abort must land while the run is streaming",
    ).toBeGreaterThan(0);
    expect(
      ctxAbortCalls,
      "bug 0319: the propagation is guarded by a one-shot flag — a re-entrant thetaAbort.abort() " +
        "MUST NOT double-cancel; at fork ctx.abort() is never called (0)",
    ).toBe(1);
    expect(execution.outcome, "the aborted query settles cancel").toBe("cancel");
  });

  it("(C) an abort landing while NO turn is in flight NEVER calls ctx.abort() (the in-flight-only scoping guard) — GREEN at fork, MUST stay green", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    let sendsAtAbort = -1;
    let idleAtAbort: boolean | undefined;

    const { execution, session } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: { abort: () => { ctxAbortCalls += 1; } },
      thetaAbort,
      onQuantum: (q, s): void => {
        // Quantum 1 is before the drive has enacted its first send (the send
        // happens in the microtask flush that follows), so the theta is idle
        // with NO turn in flight — the reachable session_shutdown-while-idle
        // shape. The abort must not tear down any run: there is none.
        if (q === 1) {
          sendsAtAbort = s.sends.length;
          idleAtAbort = s.isIdle();
          thetaAbort.abort(shutdownReason());
        }
      },
    });

    // The "no turn in flight" precondition, asserted loudly: the harness must
    // establish an idle, send-free instant for the abort to land in, or the
    // cell proves nothing about scoping.
    expect(
      sendsAtAbort,
      "the cell's premise: the abort landed BEFORE the drive issued any send",
    ).toBe(0);
    expect(
      idleAtAbort,
      "the cell's premise: the session was idle (no turn in flight) when the abort landed",
    ).toBe(true);
    expect(
      ctxAbortCalls,
      "bug 0319 §Fix: in-flight-only scoping — an idle-time abort MUST NOT call ctx.abort() and " +
        "tear down an unrelated user run; the listener only exists while a turn is being driven",
    ).toBe(0);
    // A drive aborted before it ever drives a turn short-circuits without a
    // send (the executor gates on the aborted signal) and settles cancel.
    expect(session.sends.length, "no turn was ever driven under a pre-drive abort").toBe(0);
    expect(execution.outcome, "the pre-drive abort settles cancel").toBe("cancel");
  });

  it("(D) an abort in the settle-phase waitForIdle race resolves it PROMPTLY, not after ~200 sit-out ticks (PIC-70) — RED at fork", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    let abortQuantum = -1;
    let idleAtAbort: boolean | undefined;

    // The run starts (poll 1), commits its reply (poll 2), then goes idle (poll
    // 3) so the end-poll clears and the drive REACHES the settle-race. The ctx
    // double's waitForIdle() NEVER resolves, so at fork the race can only be
    // decided by the idleBound (2000 ms ≈ 200 quanta), and post-fix by the new
    // abort leg the fix adds (production-theta-producer.ts:5223-5236).
    const { execution, settleQuantum } = await driveLiveTheta(
      ONE_QUERY_THETA,
      [{ startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: "604" }],
      {
        ctx: { abort: () => { ctxAbortCalls += 1; }, waitForIdleNever: true },
        thetaAbort,
        onQuantum: (q, session): void => {
          // Fire once the run has gone idle (end-poll cleared → the drive is in
          // the settle-race), strictly after it (q>=6 clears the ~4-quantum
          // start+end prelude).
          if (abortQuantum === -1 && q >= 6 && session.isIdle()) {
            abortQuantum = q;
            idleAtAbort = session.isIdle();
            thetaAbort.abort(shutdownReason());
          }
        },
      },
    );

    expect(
      abortQuantum,
      "the cell's premise: the abort must land inside the settle-race window (run idle, " +
        "waitForIdle pending)",
    ).toBeGreaterThan(0);
    expect(idleAtAbort, "the settle-race window is entered only once the run has gone idle").toBe(true);
    // The witness: at fork the race has no abort leg, so it sits out the full
    // idleBound (~200 quanta) despite the abort. PIC-70: "each bounded wait MUST
    // stop promptly on an observed abort rather than sitting out its full bound."
    const sitOutQuanta = settleQuantum - abortQuantum;
    expect(
      sitOutQuanta,
      `bug 0319 (PIC-70): the settle-phase waitForIdle race MUST resolve promptly on the abort — ` +
        `observed a ${sitOutQuanta}-quantum sit-out (fork sits out ` +
        `≈${WAIT_FOR_IDLE_BOUND_MS / POLL_INTERVAL_MS} quanta because the race carries no abort leg)`,
    ).toBeLessThanOrEqual(SETTLE_RACE_TICK_BUDGET);
    // The abort resolves the query as cancel, never as a settle-phase transport
    // Err (the abort short-circuit precedes the expiry mapping,
    // production-theta-producer.ts:5302).
    expect(
      execution.outcome,
      `the settle-race abort settles cancel, not a settle-phase transport Err; observed error ` +
        `${JSON.stringify(execution.error)}`,
    ).toBe("cancel");
  });

  it("(E) a throw from the ctx.abort() forwarding listener does not crash the drive and does not swallow the cancellation (fixed behaviour; vacuously green at fork)", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    const record = { quantum: -1 };
    const hook = midTurnAbortHook(thetaAbort, record);

    // cancellation.md:15 (§Forwarding-listener throw): a throw from the listener
    // "is trapped at the listener boundary … The trap MUST NOT swallow the
    // cancellation itself." At fork ctx.abort() is never called, so the throw
    // never fires and the cell is vacuously green; post-fix it exercises the
    // try/catch the fix wraps around ctx.abort().
    const { execution } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: {
        abort: () => {
          ctxAbortCalls += 1;
          throw new Error("ctx.abort boom");
        },
      },
      thetaAbort,
      onQuantum: hook.onQuantum,
    });

    hook.assertFired();
    // The drive resolved (driveLiveTheta already re-throws any executeBody
    // rejection): a listener throw must not propagate out of the drive.
    expect(
      execution.outcome,
      `the cancellation survives a forwarding-listener throw; observed error ` +
        `${JSON.stringify(execution.error)}`,
    ).toBe("cancel");
  });

  it("(F) the existing ctx.signal → thetaAbort forward still settles cancel when the reverse listener may double-fire (Esc-path control)", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    const ctxSignal = new AbortController();
    let abortQuantum = -1;

    // The end-to-end Esc-during-@-query path: Pi flips ctx.signal first, the
    // EXISTING forward (production-theta-producer.ts:5192) carries it into
    // thetaAbort. Post-fix that may in turn fire the reverse ctx.abort() — a
    // harmless/guarded no-op because Pi already tore its own run down. Either
    // way the drive must settle cancel and never crash.
    const { execution } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: { abort: () => { ctxAbortCalls += 1; }, signal: ctxSignal.signal },
      thetaAbort,
      onQuantum: (q, session): void => {
        if (abortQuantum === -1 && q >= 4 && !session.isIdle()) {
          abortQuantum = q;
          ctxSignal.abort(new Error("esc during turn"));
        }
      },
    });

    expect(abortQuantum, "the cell's premise: ctx.signal aborted while the run was streaming").toBeGreaterThan(0);
    expect(
      thetaAbort.signal.aborted,
      "the existing ctx.signal → thetaAbort forward fired (the drive gates on thetaAbort)",
    ).toBe(true);
    expect(execution.outcome, "the Esc-path drive settles cancel").toBe("cancel");
  });

  it("(G) a non-cancelled drive never touches ctx.abort() and settles Ok — the bridge attach/detach leaves the happy path byte-identical", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();

    // No abort is ever fired: a normal single-query drive that starts, commits
    // its reply, and settles. The reverse listener must attach and detach
    // without touching ctx.abort() or the extracted value.
    const { execution, session } = await driveLiveTheta(
      ONE_QUERY_THETA,
      [{ startsAfterPolls: 1, replyAfterPolls: 2, endsAfterPolls: 3, reply: "pong answer" }],
      { ctx: { abort: () => { ctxAbortCalls += 1; } }, thetaAbort },
    );

    expect(session.sends.length, "exactly one user-visible send").toBe(1);
    expect(
      ctxAbortCalls,
      "bug 0319 §Fix: a non-cancelled drive never fires the reverse listener",
    ).toBe(0);
    expect(
      execution.outcome,
      `a settled turn must succeed; error ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "the settled slice's assistant text is the query's value (PIC-53)",
    ).toBe("pong answer");
  });
});
