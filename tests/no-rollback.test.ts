// V4f-T — failing tests for the paired `V4f` no-rollback-guarantee leaf (ERR-13).
//
// Spec: errors-and-results/error-model.md (§"No rollback" ERR-13, cross-linked
// from §"Partial-append contract" and §"Runtime panics"); cancellation.md
// (§"Race semantics", §"Granularity").
//
// ERR-13: neither `?` nor a panic nor cancellation unwinds prior side effects —
// tool calls that have already returned, queries already appended, and `invoke`
// children that have already run remain final on early return, abort, or
// cancellation, and no compensating turn is injected. The guarantee is
// architectural: the runtime contains NO compensating / rollback path, so the
// tests witness it on the six enumerated authoring sites.
//
// Each vector drives a completed callee, modelled through the H4a session double
// (the invoke-child vectors via its completed-invoke-child scripting point) and
// the V17a side-effect seam (`loomAbort`, late-settlement discard) together with
// the V17c checkpoint set — NOT the live V14a / V13c / V15a surfaces.
//
// These tests red on their own primary no-rollback assertions while `V4f` is
// absent, because the V4f-T seam stub is deliberately NON-COMPLIANT:
// `handleNoRollbackTerminalEvent` unwinds every committed side effect and injects
// a compensating turn, so the "no unwind" / "no compensating turn" / "side effect
// persists" assertions red today. The compliant impl calls nothing on the
// compensator. No test reds on a compile error, a missing fixture, or a harness
// throw — the V17a / V17c / harness modelling of the completed callee is real and
// green; only the V4f no-rollback behaviour under test is absent.

import { describe, expect, it } from "vitest";
import {
  NO_ROLLBACK_AUTHORING_SITES,
  handleNoRollbackTerminalEvent,
  type CommittedSideEffect,
  type CompensatingTurn,
  type RollbackCompensator,
} from "../src/runtime/no-rollback";
import {
  createLoomAbort,
  makeCancelledError,
  routeToolCallLateSettlement,
  runCancellableSequence,
  type CancellableStatement,
  type OperationResult,
  type ToolCallCancellationGuard,
  type ToolCallSideChannels,
} from "../src/runtime/cancellation-core";
import { runCheckpointedForLoop } from "../src/runtime/checkpoint-granularity";
import {
  IndexOutOfBoundsPanic,
  isLoomPanic,
} from "../src/runtime/runtime-panics";
import type { InvokeInfraError } from "../src/runtime/query-error";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import type { LoomValue } from "../src/runtime/value";
import { loadExtension, type ResponseEvent } from "./harness/index";

const SITE: CheckpointSite = { file: "no-rollback.loom", line: 1, column: 1 };

/**
 * A `Checkpoint` whose `before(...)` invokes an injected callback on each await —
 * the deterministic-test substrate (PIC-10) that lands an abort at a chosen
 * checkpoint boundary without depending on JS microtask scheduling.
 */
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;

  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }

  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}

/**
 * A recording double of the compensating / rollback surface the runtime holds
 * against completed side effects and the driven conversation. Every call is
 * logged; a compliant runtime makes NONE of them (ERR-13). When a `ledger` is
 * supplied, `unwindSideEffect` also removes the id from it, so a test can witness
 * that a completed callee's side effect PERSISTS (the ledger is unchanged) exactly
 * when the runtime performs no rollback.
 */
function makeRecordingCompensator(ledger?: Set<string>): {
  compensator: RollbackCompensator;
  unwound: string[];
  appended: CompensatingTurn[];
  enumerated: CommittedSideEffect[][];
} {
  const unwound: string[] = [];
  const appended: CompensatingTurn[] = [];
  const enumerated: CommittedSideEffect[][] = [];
  const compensator: RollbackCompensator = {
    unwindSideEffect: (id): void => {
      unwound.push(id);
      ledger?.delete(id);
    },
    appendCompensatingTurn: (turn): void => {
      appended.push(turn);
    },
    enumerateCompletedSideEffects: (effects): void => {
      enumerated.push([...effects]);
    },
  };
  return { compensator, unwound, appended, enumerated };
}

// ===========================================================================
// Vector 1 — a `?`-early-return inside a function.
// ===========================================================================

describe("V4f-T — ERR-13 vector (1): `?`-early-return inside a function", () => {
  it("ERR-13: a `?`-early-return inside a function unwinds no prior side effect and appends no compensating turn", () => {
    // A completed tool call inside the function committed a side effect before a
    // later statement `?`-early-returned an `Err`.
    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: "fn-write-1", description: "write(report.md)" },
    ];
    const rec = makeRecordingCompensator();

    handleNoRollbackTerminalEvent(
      {
        site: "question-early-return-in-function",
        event: "question",
        committed,
      },
      rec.compensator,
    );

    // ERR-13: the completed tool call remains final — no unwind, no
    // compensating turn.
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
  });
});

// ===========================================================================
// Vector 2 — a `?`-early-return at the top of a loom block.
// ===========================================================================

describe("V4f-T — ERR-13 vector (2): `?`-early-return at the top of a loom block", () => {
  it("ERR-13: a `?`-early-return at the top of a loom block unwinds no prior side effect and appends no compensating turn", () => {
    const committed: readonly CommittedSideEffect[] = [
      { kind: "query", id: "block-query-1", description: "@ appended turn" },
    ];
    const rec = makeRecordingCompensator();

    handleNoRollbackTerminalEvent(
      {
        site: "question-early-return-loom-block",
        event: "question",
        committed,
      },
      rec.compensator,
    );

    // ERR-13: the already-appended query turn remains final — no unwind, no
    // compensating turn.
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
  });
});

// ===========================================================================
// Vector 3 — a panic in a slash-command loom.
// ===========================================================================

describe("V4f-T — ERR-13 vector (3): a panic in a slash-command loom", () => {
  it("ERR-13: a panic in a slash-command loom leaves a completed callee's side effect final and appends no compensating turn", () => {
    // The panic surface (V4b): a thrown `LoomPanic` bypasses `?`/`match`; here it
    // is the downstream terminal event after a tool call already committed.
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 5 not in 0..3");
    expect(isLoomPanic(panic)).toBe(true); // context: it is a runtime panic

    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: "slash-edit-1", description: "edit(src/x.ts)" },
      { kind: "filesystem-write", id: "slash-fs-1", description: "wrote src/x.ts" },
    ];
    const rec = makeRecordingCompensator();

    handleNoRollbackTerminalEvent(
      { site: "panic-slash-command", event: "panic", committed },
      rec.compensator,
    );

    // ERR-13: the panic unwinds nothing and injects no compensating turn.
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
    expect(rec.enumerated).toEqual([]); // no enumeration of completed side effects
  });
});

// ===========================================================================
// Vector 4 — a panic in an `invoke` child (parent observes
// InvokeInfraError { cause: "panic" }), modelled via the H4a completed-invoke-
// child scripting point.
// ===========================================================================

describe("V4f-T — ERR-13 vector (4): a panic in an `invoke` child", () => {
  it("ERR-13: a panicking `invoke` child's already-committed tool calls remain committed even though the parent observes only InvokeInfraError { cause: \"panic\" }", () => {
    // Model the completed invoke-child through the H4a / H4c harness surface
    // (category (f)), NOT the live V15a surface: the child ran a tool call to
    // completion (committing a side effect) before it panicked.
    const double = loadExtension({ fixtures: [] }).double;
    double.responses.scriptInvokeChild({
      childName: "child.loom",
      finalValue: "child-committed-a-write",
    });
    const transcript = double.driveResponses();
    const completed = transcript.find(
      (e: ResponseEvent): e is Extract<ResponseEvent, { kind: "completed-invoke-child" }> =>
        e.kind === "completed-invoke-child",
    );
    // Context: the harness modelled a completed invoke-child (its committed work).
    expect(completed?.childName).toBe("child.loom");

    // The parent observes only the failure envelope for the panicking child.
    const parentSurface: InvokeInfraError = {
      kind: "invoke_infra",
      message: "index out of bounds: 5 not in 0..3",
      callee_path: "child.loom",
      cause: "panic",
    };
    // Context: the parent-observed envelope is exactly `cause: "panic"`.
    expect(parentSurface.cause).toBe("panic");

    // The child's already-committed tool call (its completed side effect).
    const committed: readonly CommittedSideEffect[] = [
      { kind: "invoke-child", id: "child.loom", description: "child ran to completion" },
      { kind: "tool-call", id: "child-write-1", description: "child write(out.md)" },
    ];
    const rec = makeRecordingCompensator();

    handleNoRollbackTerminalEvent(
      {
        site: "panic-invoke-child",
        event: "panic",
        committed,
        invokeParentSurface: parentSurface,
      },
      rec.compensator,
    );

    // ERR-13: the child's committed tool call is NOT unwound and no compensating
    // turn is injected, even though the parent observes only the envelope.
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
  });
});

// ===========================================================================
// Vector 5 — mid-execution cancellation, modelled through the V17a side-effect
// seam (`loomAbort`, late-settlement discard) and the V17c checkpoint set.
// ===========================================================================

describe("V4f-T — ERR-13 vector (5): mid-execution cancellation", () => {
  it("ERR-13: a mid-execution cancellation leaves a completed callee's side effect final (a completed loop iteration persists) and appends no compensating turn", async () => {
    const loomAbort = createLoomAbort();
    const sideEffects: string[] = [];

    // V17c checkpoint set: a compute-bound loop where iteration 0 commits a side
    // effect; the abort lands at the loop-iter checkpoint BEFORE iteration 1, so
    // iteration 1 never runs. Iteration 0's side effect must persist (no rollback).
    const checkpoint = new ScriptedCheckpoint((call) => {
      if (call === 2) {
        loomAbort.abort(new Error("esc during loop"));
      }
    });
    const snapshot: readonly LoomValue[] = ["a", "b"];
    await runCheckpointedForLoop(checkpoint, loomAbort.signal, SITE, {
      snapshot,
      runIteration: (element): void => {
        sideEffects.push(`committed:${String(element)}`);
      },
    });
    // Context (V17c / CNCL): iteration 0 committed; iteration 1 was skipped by the
    // abort — the completed iteration's side effect persists.
    expect(sideEffects).toEqual(["committed:a"]);

    // V17a late-settlement discard: a tool call whose underlying `execute()`
    // settles LATE (after cancellation surfaced) is discarded, not rolled back and
    // not re-surfaced.
    const lateChannels: ToolCallSideChannels = {
      rebindCallSite: (): void => {
        throw new Error("must not rebind after cancellation");
      },
      emitErr: (): void => {
        throw new Error("must not emit a second Err after cancellation");
      },
      emitRuntimeEvent: (): void => {
        throw new Error("must not emit a second RuntimeEvent after cancellation");
      },
    };
    const guard: ToolCallCancellationGuard = { cancellationSurfaced: true };
    const disposition = routeToolCallLateSettlement(
      { kind: "resolved", value: { late: true } },
      guard,
      lateChannels,
    );
    // Context (V17a): the late settlement is discarded — no rollback, no re-surface.
    expect(disposition).toBe("discarded");

    // The completed callee's side effect the cancellation left behind.
    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: "cancel-tool-1", description: "committed:a" },
    ];
    const rec = makeRecordingCompensator();

    handleNoRollbackTerminalEvent(
      { site: "mid-execution-cancellation", event: "cancellation", committed },
      rec.compensator,
    );

    // ERR-13: the mid-execution cancellation unwinds nothing and injects no
    // compensating turn.
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
  });
});

// ===========================================================================
// Vector 6 — completed-callee finality: drive a tool call / invoke child to
// COMPLETION, then fire a downstream `?` / panic / cancel, and assert the
// completed callee's side effect PERSISTS and no compensating turn is injected —
// a completed callee distinct from an appended turn.
// ===========================================================================

describe("V4f-T — ERR-13 vector (6): completed-callee finality", () => {
  it("ERR-13: a completed tool call AND a completed invoke child persist after a downstream `?`, with no side effect unwound and no compensating turn injected", async () => {
    // (a) Drive a tool call to COMPLETION via the V17a checkpoint runner: the
    // statement returns Ok(v) at its checkpoint; the completed binding is retained
    // verbatim (CNCL-5, no retroactive rewrite) — the completed callee.
    const loomAbort = createLoomAbort();
    const okValue = { wrote: "out.md" };
    const noAbort = new ScriptedCheckpoint(() => {
      /* no abort at any checkpoint — the tool call runs to completion */
    });
    const statements: CancellableStatement[] = [
      {
        binding: "toolResult",
        kind: "tool-call",
        site: SITE,
        run: (): Promise<OperationResult> =>
          Promise.resolve({ ok: true, value: okValue }),
      },
    ];
    const outcome = await runCancellableSequence(
      { checkpoint: noAbort, signal: loomAbort.signal },
      statements,
    );
    // Context: the tool call completed and its Ok(v) is retained (the completed
    // callee, distinct from an appended conversation turn).
    expect(outcome.bindings.get("toolResult")).toEqual({ ok: true, value: okValue });

    // (b) Drive an invoke child to COMPLETION via the H4a completed-invoke-child
    // scripting point (category (f)) — NOT the live V15a surface.
    const double = loadExtension({ fixtures: [] }).double;
    double.responses.scriptInvokeChild({
      childName: "child.loom",
      finalValue: "child-final",
    });
    const childTranscript = double.driveResponses();
    const completedChild = childTranscript.find(
      (e: ResponseEvent): e is Extract<ResponseEvent, { kind: "completed-invoke-child" }> =>
        e.kind === "completed-invoke-child",
    );
    // Context: the invoke child ran to completion and surfaced its produced value.
    expect(completedChild?.finalValue).toBe("child-final");

    // A ledger of the two completed callees' side effects; the runtime performing
    // no rollback leaves it intact.
    const toolEffectId = "completed-tool-effect";
    const invokeEffectId = "completed-invoke-effect";
    const ledger = new Set<string>([toolEffectId, invokeEffectId]);
    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: toolEffectId, description: "write(out.md)" },
      { kind: "invoke-child", id: invokeEffectId, description: "child.loom side effect" },
    ];
    const rec = makeRecordingCompensator(ledger);

    // Downstream terminal event: a `?`-early-return AFTER both callees completed.
    handleNoRollbackTerminalEvent(
      { site: "completed-callee-finality", event: "question", committed },
      rec.compensator,
    );

    // ERR-13: both completed callees' side effects PERSIST (the ledger is
    // unchanged) and no compensating turn is injected.
    expect([...ledger].sort()).toEqual([toolEffectId, invokeEffectId].sort());
    expect(rec.unwound).toEqual([]);
    expect(rec.appended).toEqual([]);
  });

  it("ERR-13: completed-callee finality holds symmetrically for a downstream panic and cancellation, with a completed callee distinct from an appended turn", () => {
    // The completed callee's side effect must persist regardless of WHICH
    // downstream terminal event fires; drive both a panic and a cancellation over
    // the same completed callee and the same enumerated authoring site.
    const committed: readonly CommittedSideEffect[] = [
      { kind: "tool-call", id: "final-tool-1", description: "completed tool call" },
    ];

    for (const event of ["panic", "cancellation"] as const) {
      const ledger = new Set<string>(["final-tool-1"]);
      const rec = makeRecordingCompensator(ledger);

      handleNoRollbackTerminalEvent(
        { site: "completed-callee-finality", event, committed },
        rec.compensator,
      );

      // ERR-13: the completed callee's side effect persists and no compensating
      // turn is injected on either downstream terminal-event kind.
      expect([...ledger]).toEqual(["final-tool-1"]);
      expect(rec.unwound).toEqual([]);
      expect(rec.appended).toEqual([]);
    }
  });
});

// ===========================================================================
// Enumeration guard — the six authoring sites are exactly the ERR-13 set.
// ===========================================================================

describe("V4f-T — ERR-13 enumerated authoring sites", () => {
  it("ERR-13: the seam enumerates exactly the six §No rollback authoring sites the guarantee is witnessed on", () => {
    expect([...NO_ROLLBACK_AUTHORING_SITES]).toEqual([
      "question-early-return-in-function",
      "question-early-return-loom-block",
      "panic-slash-command",
      "panic-invoke-child",
      "mid-execution-cancellation",
      "completed-callee-finality",
    ]);

    // Every enumerated site drives the seam without a compensating call under a
    // compliant runtime; the makeCancelledError helper is the shared cancellation
    // envelope the mid-execution vector surfaces (context).
    expect(makeCancelledError().kind).toBe("cancelled");
  });
});
