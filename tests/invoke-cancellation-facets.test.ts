import { describe, expect, it } from "vitest";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import type {
  CommittedSideEffect,
  CompensatingTurn,
  RollbackCompensator,
} from "../src/runtime/no-rollback";
import { handleNoRollbackTerminalEvent } from "../src/runtime/no-rollback";
import { makeOk } from "../src/runtime/value";
import {
  runInvokeChild,
  type InvokeChild,
} from "../src/runtime/invoke-cancellation";

// V15m-T — failing tests for the paired `V15m` "Invoke-site cancellation
// checkpoint and completed-callee-finality witness" implementation leaf.
//
// Spec: cancellation.md §Granularity (coverage-matrix.md code-keyed-area token
// `cka-47`, `V15m` `invoke` checkpoint facet — the `invoke` per-site presence
// arm distributed off V17c; V8a `Checkpoint` seam PIC-10,
// host-interfaces-services.md#checkpoint-seam); invocation.md;
// errors-and-results/error-model.md §"No rollback" (ERR-13, delegated live
// carrier for V4f's completed-callee-finality deferral).
//
// Each test reds on its own primary assertion because the V15m behaviour is
// absent: `runInvokeChild` fires no checkpoint, never drives the child, and
// returns a cancelled outcome carrying no committed side effect. No test reds on
// a compile error, a missing fixture, or a harness throw.

const INVOKE_SITE: CheckpointSite = { file: "parent.theta", line: 9, column: 11 };

/** A never-aborted signal for the checkpoint-presence and value arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * A `Checkpoint` recording the ordered `(kind, site)` sequence so a test can
 * assert a cancellation checkpoint fires immediately before each `invoke`
 * dispatch (PIC-10 / cancellation.md §Granularity). `before` resolves on the
 * microtask queue — the macrotask-yield property is `V17c`'s, not this leaf's.
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

/** An `invoke` child that records when it is driven and returns `Ok(value)`. */
function drivenChild(
  calleePath: string,
  value: string,
  log: string[],
  committed: readonly CommittedSideEffect[] = [],
): InvokeChild {
  return {
    calleePath,
    drive: async () => {
      log.push("drive");
      // Models an ordinary callee that ran and returned Ok (bug 0294 provenance).
      return { source: "callee-returned", result: makeOk(value) };
    },
    committed,
  };
}

// ===========================================================================
// cka-47 / V15m — a cancellation checkpoint fires immediately before each
// `invoke` call on the live execution surface (cancellation.md §Granularity;
// V8a Checkpoint seam PIC-10).
// ===========================================================================

describe("V15m-T — invoke-site cancellation checkpoint (cka-47 / V15m)", () => {
  it("cka-47 / V15m: an 'invoke' checkpoint fires immediately before the child spawn, carrying the call site", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const child = drivenChild("./child.theta", "done", log);

    await runInvokeChild(checkpoint, liveSignal(), INVOKE_SITE, child);

    // The `invoke` checkpoint precedes the child spawn and carries the call site.
    expect(checkpoint.kinds[0]).toBe("invoke");
    expect(checkpoint.sites[0]).toEqual(INVOKE_SITE);
    expect(log.indexOf("checkpoint:invoke")).toBeLessThan(log.indexOf("drive"));
  });

  it("cka-47 / V15m: an abort observed at the invoke checkpoint skips the child spawn", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log);
    const controller = new AbortController();
    controller.abort(); // already aborted before the pre-dispatch checkpoint
    const child = drivenChild("./child.theta", "done", log);

    const outcome = await runInvokeChild(
      checkpoint,
      controller.signal,
      INVOKE_SITE,
      child,
    );

    // The checkpoint fired, the abort was observed, and the child was not spawned.
    expect(checkpoint.kinds).toEqual(["invoke"]);
    expect(outcome.kind).toBe("cancelled");
    expect(log.includes("drive")).toBe(false);
  });

  it("cka-47 / V15m: a cleanly-completing live child surfaces its Ok(value) after the checkpoint", async () => {
    const checkpoint = new RecordingCheckpoint([]);
    const outcome = await runInvokeChild(
      checkpoint,
      liveSignal(),
      INVOKE_SITE,
      drivenChild("./child.theta", "plan-value", []),
    );

    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.result.ok).toBe(true);
      if (outcome.result.ok) {
        expect(outcome.result.value).toBe("plan-value");
      }
    }
  });
});

// ===========================================================================
// ERR-13 (V15m delegated live-carrier witness) — completed-callee finality on
// the live `invoke` execution surface: an invoke child driven to completion
// keeps its committed side effect after a downstream terminal event, with no
// compensating turn injected (error-model.md#err-13; delegated live carrier for
// V4f's completed-callee-finality deferral).
// ===========================================================================

describe("V15m-T — ERR-13 completed-callee finality on the live invoke surface (error-model.md#err-13)", () => {
  it("ERR-13 (V15m): an invoke child driven to completion keeps its committed side effect after a downstream cancel, with no compensating turn injected", async () => {
    const committed: readonly CommittedSideEffect[] = [
      { kind: "invoke-child", id: "theta-invoke:child-0", description: "child.theta committed" },
    ];
    const child = drivenChild("./child.theta", "done", [], committed);

    // Drive the invoke child to completion on the live surface (commits its effect).
    const outcome = await runInvokeChild(
      new RecordingCheckpoint([]),
      liveSignal(),
      INVOKE_SITE,
      child,
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.committed).toEqual(committed);

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
    expect(outcome.committed).toHaveLength(1);
  });

  it("ERR-13 (V15m): a completed invoke child stays final after a downstream ? early-return and a downstream panic, with no compensating turn injected", async () => {
    const committed: readonly CommittedSideEffect[] = [
      { kind: "invoke-child", id: "theta-invoke:child-1", description: "logger.theta committed" },
    ];
    const child = drivenChild("./logger.theta", "done", [], committed);

    const outcome = await runInvokeChild(
      new RecordingCheckpoint([]),
      liveSignal(),
      INVOKE_SITE,
      child,
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;

    // A `?` early-return and a panic downstream of the completed child both leave
    // its committed side effect final and inject no compensating turn (ERR-13).
    for (const event of ["question", "panic"] as const) {
      const spy = new SpyCompensator();
      handleNoRollbackTerminalEvent(
        { site: "completed-callee-finality", event, committed: outcome.committed },
        spy,
      );
      expect(spy.calls).toEqual([]);
    }
    expect(outcome.committed).toEqual(committed);
  });
});
