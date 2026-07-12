// V13c-T — failing tests for the paired `V13c` query tool loop and typed
// two-phase respond surface.
//
// Spec: query/query-tool-loop.md (QRY-13 … QRY-16, the free-phase tool-call loop
// and the typed two-phase forced-respond turn; the `max_rounds: 0` boundary; the
// depth-6 worked example), hard-ceilings/ceilings-3-and-4.md (CIO-3/CIO-4/CIO-6,
// ceiling #4 JSON-document depth, the `masked` field), cancellation.md
// §Granularity (coverage-matrix.md code-keyed-area token `cka-47`, `V13c`
// `@`-query-dispatch checkpoint facet), errors-and-results/error-model.md
// (ERR-13 no-rollback completed-callee finality).
//
// Each test drives the live `V13c` query-tool-loop surface (`runUntypedQueryLoop`
// / `runTypedQueryLoop`) through a deterministic scripted model and reds on its
// own primary assertion while `V13c` is absent: the stub drivers fire no
// `@`-query-dispatch checkpoint, run no tool-call round, and dispatch no forced
// respond turn, so the slot-accounting, `max_rounds: 0`, exhaustion, depth-6
// co-fire, checkpoint, and ERR-13 expectations red rather than a compile error,
// a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import {
  runTypedQueryLoop,
  runUntypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type ToolCallRequest,
} from "../src/runtime/query-tool-loop";
import type { TransportError } from "../src/runtime/query-error";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import {
  handleNoRollbackTerminalEvent,
  type CompensatingTurn,
  type RollbackCompensator,
} from "../src/runtime/no-rollback";
import { computeMasked } from "../src/runtime/runtime-event-channel";
import { jsonDepth } from "../src/runtime/depth-walk";

const QUERY_SITE: CheckpointSite = { file: "review.loom", line: 7, column: 3 };

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: QUERY_SITE,
    loomSlashName: "/depth-6-co-fire",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

/** A never-aborted signal for the non-cancellation arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * A `Checkpoint` recording the ordered `(kind, site)` sequence so a test can
 * assert a cancellation checkpoint fires immediately before the `@`-query
 * dispatch (PIC-10). `before` resolves on the microtask queue — the macrotask
 * property is `V17c`'s, not this leaf's.
 */
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    this.log.push(`checkpoint:${kind}`);
    return Promise.resolve();
  }
}

/**
 * A deterministic scripted `QueryModelDriver`: the ordered free-phase turns, an
 * optional forced-respond turn, and the side effects each round's tool batch
 * commits. Records which surfaces were driven so a test can assert the
 * `max_rounds: 0` boundary issues no free-phase provider call.
 */
class ScriptedModel implements QueryModelDriver {
  readonly log: string[];
  freePhaseCalls = 0;
  forcedRespondCalls = 0;

  readonly #freeTurns: readonly FreePhaseTurn[];
  readonly #forced: ForcedRespondTurn;
  readonly #batchEffects: ReadonlyMap<number, readonly CommittedSideEffect[]>;

  constructor(
    log: string[],
    freeTurns: readonly FreePhaseTurn[],
    forced: ForcedRespondTurn,
    batchEffects?: ReadonlyMap<number, readonly CommittedSideEffect[]>,
  ) {
    this.log = log;
    this.#freeTurns = freeTurns;
    this.#forced = forced;
    this.#batchEffects = batchEffects ?? new Map();
  }

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.freePhaseCalls += 1;
    const turn = this.#freeTurns[round];
    if (turn === undefined) {
      // Loud failure rather than a silent hang: a correct loop never reads past
      // the scripted free phase (it terminates on a text turn or the
      // `max_rounds`-final branch before this point).
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    this.log.push(`free-turn:${round}:${turn.kind}`);
    return Promise.resolve(turn);
  }

  runToolBatch(
    batch: readonly ToolCallRequest[],
    round: number,
  ): Promise<readonly CommittedSideEffect[]> {
    this.log.push(`tool-batch:${round}:${batch.length}`);
    return Promise.resolve(this.#batchEffects.get(round) ?? []);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    this.forcedRespondCalls += 1;
    this.log.push("forced-respond");
    return Promise.resolve(this.#forced);
  }
}

/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];

  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }

  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }

  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}

const toolUse = (...ids: string[]): FreePhaseTurn => ({
  kind: "tool_use",
  batch: ids.map((toolUseId) => ({ toolName: "search", toolUseId })),
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });
const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });

/** PIC-50/51: a driver-signalled transport failure (free-phase or forced-respond). */
const transportError = (message: string): TransportError => ({
  kind: "transport",
  message,
  http_status: null,
  provider: "anthropic",
  retryable: false,
});
const transportTurn = (message: string): FreePhaseTurn => ({
  kind: "transport",
  error: transportError(message),
});

// ===========================================================================
// CIO-4 — free-phase slot accounting: rounds advance, a parallel batch is one
// slot, the forced-respond turn is exempt (query-tool-loop.md; CIO-4 final
// branch).
// ===========================================================================

describe("V13c-T — CIO-4 free-phase slot accounting (query-tool-loop.md)", () => {
  it("CIO-4: the free phase advances one slot per round, a parallel batch counts as one slot, and the forced-respond turn is exempt", async () => {
    const log: string[] = [];
    // A typed query so the forced-respond terminator is present: round 0 is a
    // single tool call, round 1 is a parallel batch of two (one slot), round 2
    // is a terminating text turn that triggers the exempt forced respond turn.
    const model = new ScriptedModel(
      log,
      [toolUse("a"), toolUse("b", "c"), textTurn("done")],
      respond({ answer: "ok" }),
    );

    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(3),
    );

    // CIO-4: one slot per free-phase round; the round-1 parallel batch of two
    // tool calls consumes exactly one slot (not two).
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.rounds).toEqual([
      { round: 0, batchSize: 1, slotCountAfter: 1 },
      { round: 1, batchSize: 2, slotCountAfter: 2 },
    ]);
    // CIO-4 final branch: the forced respond turn was dispatched as the
    // exempt-routed terminator and is NOT counted against `max_rounds`.
    expect(outcome.forcedRespond.dispatched).toBe(true);
    expect(outcome.forcedRespond.countedAgainstMaxRounds).toBe(false);
    expect(outcome.forcedRespond.slotCountAtDispatch).toBe(2);
  });
});

// ===========================================================================
// QRY-14 — the `max_rounds: 0` typed boundary takes the forced-respond branch
// at the start (query-tool-loop.md#qry-14).
// ===========================================================================

describe("V13c-T — QRY-14 max_rounds:0 forced-respond boundary (query-tool-loop.md#qry-14)", () => {
  it("QRY-14: max_rounds:0 (typed) dispatches the forced respond turn as the only turn, with no free-phase provider call", async () => {
    const log: string[] = [];
    const model = new ScriptedModel(log, [], respond({ answer: "ok" }));

    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(0),
    );

    // QRY-14: the `max_rounds`-final branch fires at typed-query start
    // (slot_count == max_rounds, 0 == 0) — the forced respond turn is the first
    // and only turn and no free-phase provider call is issued.
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(model.freePhaseCalls).toBe(0);
    expect(model.forcedRespondCalls).toBe(1);
    expect(outcome.rounds).toEqual([]);
    expect(outcome.forcedRespond.dispatched).toBe(true);
    expect(outcome.forcedRespond.countedAgainstMaxRounds).toBe(false);
    expect(outcome.forcedRespond.slotCountAtDispatch).toBe(0);
    expect(outcome.value).toEqual({ answer: "ok" });
  });
});

// ===========================================================================
// QRY-16 — untyped exhaustion: ceiling #2 surfaces as
// `Err(ToolLoopExhaustedError)` with no `masked` field (query-tool-loop.md#qry-16).
// ===========================================================================

describe("V13c-T — QRY-16 untyped tool-loop exhaustion (query-tool-loop.md#qry-16)", () => {
  it("QRY-16: an untyped query that never terminates surfaces tool_loop_exhausted at max_rounds, masked omitted (never [])", async () => {
    const log: string[] = [];
    // The model emits a `tool_use` turn on every round and never a terminating
    // text turn, so the loop exhausts at max_rounds = 2.
    const model = new ScriptedModel(
      log,
      [toolUse("a"), toolUse("b"), toolUse("c")],
      respond(null),
    );

    const outcome = await runUntypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(2),
    );

    // QRY-16: reaching the cap without a terminating plain-text turn surfaces
    // `Err(QueryError { kind: "tool_loop_exhausted" })` (ERR-19 shape).
    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    expect(outcome.error.kind).toBe("tool_loop_exhausted");
    expect(outcome.error.rounds).toBe(2);
    // CIO-4: exactly `max_rounds` free-phase rounds ran before exhaustion.
    expect(outcome.rounds).toHaveLength(2);
    // The `masked` field is omitted on this surface (never `[]`): no ceiling
    // co-fired at the untyped exhaustion path.
    expect("masked" in outcome.error).toBe(false);
  });
});

// ===========================================================================
// QRY-16 — typed depth-6 co-fire vector (query-tool-loop.md worked example):
// ceiling #4 surfaces in loom code as the validation `Err`; the co-satisfied
// ceiling #2 is enumerated on the operator-facing RuntimeEvent's `masked` only.
// ===========================================================================

describe("V13c-T — QRY-16 typed depth-6 co-fire vector (query-tool-loop.md#qry-16)", () => {
  it("QRY-16: a depth-6 typed response surfaces validation/maxDepth in loom code and enumerates ['ceiling#2'] on details.event.masked, never on the QueryError", async () => {
    const log: string[] = [];
    // The depth-6 payload from the worked example: five nested object levels
    // terminating in a string scalar → depth 6 under the counting algorithm.
    const depth6 = { deeply: { nested: { value: { a: { b: "x" } } } } };
    // Guard: the payload really is depth-6 (> the depth-5 cap), so ceiling #4
    // fires on it.
    expect(jsonDepth(depth6)).toBe(6);

    // Two free-phase tool rounds occupy the loop to max_rounds = 2, so the
    // forced respond turn is dispatched at the `max_rounds`-final branch — the
    // only V1-reachable ceiling-#2 co-fire (slot_count == max_rounds, 2 == 2).
    const model = new ScriptedModel(
      log,
      [toolUse("a"), toolUse("b")],
      respond(depth6),
    );

    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(2),
    );

    // CIO-3: ceiling #4's depth walk (V5e) runs before AJV and surfaces the
    // validation `Err` in loom code.
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.kind).toBe("validation");
    expect(outcome.error.cause).toBe("schema_validation");
    expect(outcome.error.validation_errors[0]?.schema_keyword).toBe("maxDepth");
    // CIO-6: the co-satisfied ceiling #2 is enumerated on the operator-facing
    // RuntimeEvent's `masked` (wire location details.event.masked), matching the
    // V1-reachable predicate.
    expect(outcome.event.masked).toEqual(["ceiling#2"]);
    expect(
      computeMasked({
        kind: "validation",
        validationCause: "schema_validation",
        atTypedQueryResponse: true,
        turnKind: "forced_respond",
        toolLoopSlotCount: 2,
        maxRounds: 2,
      }),
    ).toEqual(["ceiling#2"]);
    // The surfaced ceiling is the observable `validation`/`maxDepth` `Err`; the
    // masked ceiling #2 is NEVER carried on the QueryError itself.
    expect("masked" in outcome.error).toBe(false);
  });
});

// ===========================================================================
// cka-47 / V13c — a cancellation checkpoint fires immediately before each
// `@`-query dispatch (cancellation.md §Granularity; V8a Checkpoint seam).
// ===========================================================================

describe("V13c-T — @-query-dispatch cancellation checkpoint (cka-47 / V13c)", () => {
  it("cka-47 / V13c: a query checkpoint fires immediately before the @-query dispatch, carrying the query site", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const model = new ScriptedModel(log, [textTurn("answer")], respond(null));

    await runUntypedQueryLoop(checkpoint, liveSignal(), model, config(4));

    // The `query` checkpoint precedes the first provider turn of the dispatch.
    expect(checkpoint.kinds[0]).toBe("query");
    expect(checkpoint.sites[0]).toEqual(QUERY_SITE);
    expect(log[0]).toBe("checkpoint:query");
    expect(log.indexOf("checkpoint:query")).toBeLessThan(log.indexOf("free-turn:0:text"));
  });

  it("cka-47 / V13c: an abort observed at the @-query-dispatch checkpoint skips the dispatch", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const controller = new AbortController();
    controller.abort(); // already aborted before the pre-dispatch checkpoint
    const model = new ScriptedModel(log, [textTurn("answer")], respond(null));

    const outcome = await runUntypedQueryLoop(
      checkpoint,
      controller.signal,
      model,
      config(4),
    );

    // The checkpoint fired, the abort was observed, and no provider turn ran.
    expect(checkpoint.kinds).toEqual(["query"]);
    expect(outcome.kind).toBe("cancelled");
    expect(model.freePhaseCalls).toBe(0);
  });
});

// ===========================================================================
// ERR-13 (V13c co-witness) — completed-callee finality on the live query-tool-
// loop surface: a callee driven to completion stays final after a downstream
// terminal event, its side effect persisting with no compensating turn injected
// (error-model.md#err-13).
// ===========================================================================

describe("V13c-T — ERR-13 completed-callee finality on the live V13c surface (error-model.md#err-13)", () => {
  it("ERR-13 (V13c): a query-tool-loop callee driven to completion keeps its committed side effect after a downstream cancel, with no compensating turn injected", async () => {
    const log: string[] = [];
    const committedByRound = new Map<number, readonly CommittedSideEffect[]>([
      [
        0,
        [{ kind: "tool-call", id: "call-0", description: "search executed" }],
      ],
    ]);
    // Round 0 runs a tool call to completion (committing its side effect), then
    // round 1 terminates the query with a plain-text turn.
    const model = new ScriptedModel(
      log,
      [toolUse("a"), textTurn("done")],
      respond(null),
      committedByRound,
    );

    const outcome = await runUntypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(4),
    );

    // The callee ran to completion on the live surface and committed its side
    // effect.
    expect(outcome.kind).toBe("text");
    if (outcome.kind !== "text") return;
    expect(outcome.committed).toEqual([
      { kind: "tool-call", id: "call-0", description: "search executed" },
    ]);

    // Fire a downstream cancellation through the no-rollback contract and assert
    // the runtime injects no compensating turn and unwinds nothing — the
    // completed callee's side effect persists (ERR-13, completed-callee finality).
    const spy = new SpyCompensator();
    handleNoRollbackTerminalEvent(
      {
        site: "completed-callee-finality",
        event: "cancellation",
        committed: outcome.committed,
      },
      spy,
    );
    expect(spy.calls).toEqual([]);
    // The side effect is still present — nothing was compensated or enumerated.
    expect(outcome.committed).toHaveLength(1);
  });
});

// ===========================================================================
// PIC-50/51 — a driver-signalled transport failure surfaces as the query's
// `transport` outcome (never masked as `text`/`value`). The prompt-mode driver
// synthesises the `transport` free-phase / forced-respond turn from a
// `stopReason: "error"` turn or a `sendUserMessage` sync-throw; here a scripted
// driver signals it directly to prove the loop → outcome channel.
// ===========================================================================

describe("PIC-50/51 — prompt-mode transport-error surfacing (conversation-drive.md)", () => {
  it("untyped: a transport free-phase turn surfaces Err(transport), never Ok(text)", async () => {
    const model = new ScriptedModel([], [transportTurn("provider 529")], respond(null));
    const outcome = await runUntypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(4),
    );
    expect(outcome.kind).toBe("transport");
    if (outcome.kind !== "transport") return;
    expect(outcome.error.kind).toBe("transport");
    expect(outcome.error.message).toBe("provider 529");
    expect(outcome.error.retryable).toBe(false);
  });

  it("typed: a transport forced-respond turn surfaces Err(transport), never parsed as a value", async () => {
    // `max_rounds: 0` routes straight to the forced-respond terminator.
    const model = new ScriptedModel([], [], { kind: "transport", error: transportError("forced-respond error") });
    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(0),
    );
    expect(outcome.kind).toBe("transport");
    if (outcome.kind !== "transport") return;
    expect(outcome.error.message).toBe("forced-respond error");
    // The forced-respond terminator was dispatched but its payload was never
    // parsed into a value.
    expect(outcome.forcedRespond.dispatched).toBe(true);
    expect(model.forcedRespondCalls).toBe(1);
  });

  it("typed: a transport free-phase turn aborts before the forced-respond terminator", async () => {
    const model = new ScriptedModel([], [transportTurn("free-phase error")], respond({ ok: true }));
    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint([]),
      liveSignal(),
      model,
      config(4),
    );
    expect(outcome.kind).toBe("transport");
    if (outcome.kind !== "transport") return;
    expect(outcome.error.message).toBe("free-phase error");
    // The forced-respond terminator was never dispatched.
    expect(outcome.forcedRespond.dispatched).toBe(false);
    expect(model.forcedRespondCalls).toBe(0);
  });
});
