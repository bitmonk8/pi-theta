// V17a-T — failing tests for the paired `V17a` cancellation core.
//
// Spec: cancellation.md (CNCL-1 … CNCL-6, §Signal source, §Forwarding into
// `thetaAbort`, §Propagation, §Race semantics — late-settlement discard,
// §Race semantics — swallowing-handler attachment on every abandonable
// Promise); pi-integration-contract/host-interfaces-services.md (§`Checkpoint`
// seam, PIC-10).
//
// These tests red on their own primary assertions while `V17a` is absent:
//   - the `forward*` helpers / `abortForAgentEnd` are no-ops, so `thetaAbort`
//     never fires and forwarding + CNCL-4 reason identity red;
//   - `deriveChildThetaAbort` returns an unlinked controller, so downward-only
//     propagation reds;
//   - `routeToolCallLateSettlement` rebinds/re-emits after cancellation, so
//     CNCL-1/2/3 red;
//   - `attachSwallowingHandler` attaches no handler and
//     `routeAbandonableSettlement` re-surfaces, so the three-side-channel
//     substrate-suppression assertions red;
//   - `runCancellableSequence` synthesises a top-level `cancelled` and retains
//     no bindings, so CNCL-5 / CNCL-6 red.
// No test reds on a compile error, a missing fixture, or a harness throw.
import {
  createUnhandledRejectionTrap,
  makeChannels as makeSubstrateChannels,
  settleAndObserve,
} from "./helpers/unhandled-rejection-trap";
import { ScriptedCheckpoint } from "./helpers/invoke-seam-scaffold";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CheckpointSite } from "../src/seams/checkpoint";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type { QueryError } from "../src/runtime/query-error";
import {
  AGENT_END_CANCEL_MESSAGE,
  abortForAgentEnd,
  attachSwallowingHandler,
  createThetaAbort,
  deriveChildThetaAbort,
  forwardSlashCommandCancel,
  forwardToolExposedCancel,
  routeAbandonableSettlement,
  routeToolCallLateSettlement,
  runCancellableSequence,
  type CancellableStatement,
  type OperationResult,
  type SubstrateCancellationGuard,
  type ToolCallCancellationGuard,
  type ToolCallSideChannels,
} from "../src/runtime/cancellation-core";

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

// ===========================================================================
// Forwarding into `thetaAbort` (cancellation.md §Signal source / §Forwarding).
// ===========================================================================

describe("V17a-T — forwarding into thetaAbort (never ctx.signal directly)", () => {
  it("slash-command: an aborted ctx.signal forwards into thetaAbort.signal (a distinct signal from ctx.signal)", () => {
    const thetaAbort = createThetaAbort();
    const ctx = new AbortController();
    forwardSlashCommandCancel(thetaAbort, ctx.signal);

    // The single source of truth downstream sees is thetaAbort.signal — a
    // distinct AbortSignal from ctx.signal, so downstream never reads ctx.signal
    // directly.
    expect(thetaAbort.signal).not.toBe(ctx.signal);

    ctx.abort(new Error("esc pressed"));
    // Forwarding fires thetaAbort from the slash-command path.
    expect(thetaAbort.signal.aborted).toBe(true);
  });

  it("slash-command: tolerates ctx.signal === undefined (idle non-turn entry) without throwing", () => {
    const thetaAbort = createThetaAbort();
    // Pi documents ctx.signal as undefined in idle, non-turn contexts — exactly
    // when the slash-command handler fires. Forwarding must not depend on its
    // truthiness.
    expect(() => forwardSlashCommandCancel(thetaAbort, undefined)).not.toThrow();
  });

  it("tool-exposed: an aborted execute() signal forwards into thetaAbort.signal", () => {
    const thetaAbort = createThetaAbort();
    const toolSignal = new AbortController();
    forwardToolExposedCancel(thetaAbort, toolSignal.signal);

    expect(thetaAbort.signal).not.toBe(toolSignal.signal);
    toolSignal.abort(new Error("tool cancelled"));
    expect(thetaAbort.signal.aborted).toBe(true);
  });

  it("invoke-parent: the derived child aborts through its own thetaAbort, not the parent signal directly", () => {
    const parent = new AbortController();
    const { controller: child } = deriveChildThetaAbort(parent.signal);

    // The child owns its own thetaAbort controller (a distinct signal).
    expect(child.signal).not.toBe(parent.signal);
    parent.abort(new Error("parent cancelled"));
    expect(child.signal.aborted).toBe(true);
  });
});

// ===========================================================================
// CNCL-4 — abort-reason propagation (reason identity, first source wins).
// ===========================================================================

describe("V17a-T — CNCL-4 abort-reason propagation through all three paths", () => {
  it("CNCL-4: slash-command path — thetaAbort.signal.reason === ctx.signal.reason at the downstream checkpoint", async () => {
    const thetaAbort = createThetaAbort();
    const ctx = new AbortController();
    const reason = new Error("esc reason");
    forwardSlashCommandCancel(thetaAbort, ctx.signal);

    // Land the abort via the Checkpoint seam: on the checkpoint await, the
    // slash-command source aborts with `reason`.
    const checkpoint = new ScriptedCheckpoint(() => ctx.abort(reason));
    await checkpoint.before("tool-call");

    // CNCL-4: reason identity (not merely aborted) at the downstream checkpoint.
    expect(thetaAbort.signal.reason).toBe(reason);
  });

  it("CNCL-4: tool-exposed path — thetaAbort.signal.reason === signal.reason", async () => {
    const thetaAbort = createThetaAbort();
    const toolSignal = new AbortController();
    const reason = new Error("tool reason");
    forwardToolExposedCancel(thetaAbort, toolSignal.signal);

    const checkpoint = new ScriptedCheckpoint(() => toolSignal.abort(reason));
    await checkpoint.before("tool-call");

    expect(thetaAbort.signal.reason).toBe(reason);
  });

  it("CNCL-4: invoke-parent path — the derived child's reason === parentSignal.reason", async () => {
    const parent = new AbortController();
    const reason = new Error("parent reason");
    const { controller: child } = deriveChildThetaAbort(parent.signal);

    const checkpoint = new ScriptedCheckpoint(() => parent.abort(reason));
    await checkpoint.before("invoke");

    expect(child.signal.reason).toBe(reason);
  });

  it("CNCL-4: the reason-less agent_end trigger synthesises Error.message byte-exact 'theta cancelled by agent_end'", () => {
    const thetaAbort = createThetaAbort();
    abortForAgentEnd(thetaAbort);

    expect(thetaAbort.signal.aborted).toBe(true);
    const reason = thetaAbort.signal.reason as Error | undefined;
    // Byte-exact synthesised message per CNCL-4.
    expect(reason?.message).toBe(AGENT_END_CANCEL_MESSAGE);
    expect(reason?.message).toBe("theta cancelled by agent_end");
  });

  it("CNCL-4: the first source's reason wins under the one-shot guard (a later forwarder does not re-stamp)", () => {
    const thetaAbort = createThetaAbort();
    const first = new AbortController();
    const second = new AbortController();
    const firstReason = new Error("first");
    const secondReason = new Error("second");
    forwardSlashCommandCancel(thetaAbort, first.signal);
    forwardToolExposedCancel(thetaAbort, second.signal);

    first.abort(firstReason);
    second.abort(secondReason);

    // The one-shot guard means the second forwarder does not re-stamp the reason.
    expect(thetaAbort.signal.reason).toBe(firstReason);
  });
});

// ===========================================================================
// Downward-only propagation (cancellation.md §Propagation).
// ===========================================================================

describe("V17a-T — downward-only propagation (parent → child, never child → parent)", () => {
  it("propagates parent → child: aborting the parent aborts the derived child", () => {
    const parent = new AbortController();
    const { controller: child } = deriveChildThetaAbort(parent.signal);
    expect(child.signal.aborted).toBe(false);

    parent.abort(new Error("parent"));
    expect(child.signal.aborted).toBe(true);
  });

  it("never propagates child → parent: a child cancelling internally leaves the parent's signal untouched", () => {
    const parent = new AbortController();
    const { controller: child } = deriveChildThetaAbort(parent.signal);

    child.abort(new Error("child internal cancel"));
    // Downward-only: the child's internal cancel does not abort the parent.
    expect(parent.signal.aborted).toBe(false);
  });

  it("parent already aborted at child-spawn time: the derived child is returned already-aborted", () => {
    const parent = new AbortController();
    const reason = new Error("pre-aborted parent");
    parent.abort(reason);

    const { controller: child } = deriveChildThetaAbort(parent.signal);
    // A parent already aborted at spawn time yields an already-aborted child
    // carrying the parent's reason (the child surfaces cancelled synchronously).
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe(reason);
  });
});

// ===========================================================================
// CNCL-1/2/3 — late-settlement discard at the tool-call checkpoint.
// ===========================================================================

interface ToolCallRecording {
  readonly channels: ToolCallSideChannels;
  readonly rebinds: unknown[];
  readonly errs: QueryError[];
  readonly events: RuntimeEvent[];
}

function makeToolCallChannels(): ToolCallRecording {
  const rebinds: unknown[] = [];
  const errs: QueryError[] = [];
  const events: RuntimeEvent[] = [];
  const channels: ToolCallSideChannels = {
    rebindCallSite: (value): void => {
      rebinds.push(value);
    },
    emitErr: (error): void => {
      errs.push(error);
    },
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
  };
  return { channels, rebinds, errs, events };
}

describe("V17a-T — late tool-call settlement discard (CNCL-1/2/3)", () => {
  it("CNCL-1: a late tool-call value does not rebind its call site once cancellation has surfaced", () => {
    const rec = makeToolCallChannels();
    const guard: ToolCallCancellationGuard = { cancellationSurfaced: true };

    const disposition = routeToolCallLateSettlement(
      { kind: "resolved", value: { late: true } },
      guard,
      rec.channels,
    );

    // CNCL-1 (clause a): no rebind.
    expect(rec.rebinds).toEqual([]);
    expect(disposition).toBe("discarded");
  });

  it("CNCL-2: no second Err is produced per invocation after cancellation surfaced", () => {
    const rec = makeToolCallChannels();
    const guard: ToolCallCancellationGuard = { cancellationSurfaced: true };

    // A late rejection whose value would otherwise be Err-worthy — still discarded.
    routeToolCallLateSettlement(
      { kind: "rejected", error: new Error("late reject") },
      guard,
      rec.channels,
    );

    // CNCL-2 (clause b): no second Err.
    expect(rec.errs).toEqual([]);
  });

  it("CNCL-3: no second RuntimeEvent is produced per invocation after cancellation surfaced", () => {
    const rec = makeToolCallChannels();
    const guard: ToolCallCancellationGuard = { cancellationSurfaced: true };

    routeToolCallLateSettlement(
      { kind: "error-result", value: { isError: true } },
      guard,
      rec.channels,
    );

    // CNCL-3 (clause c): no second RuntimeEvent.
    expect(rec.events).toEqual([]);
  });
});

// ===========================================================================
// Swallowing-handler three-side-channel suppression at the Checkpoint-seam
// substrate. The test source cites both the cka-33 row token and this facet's
// V17a leaf-ID inline so the H5f per-facet citing-test gate associates this
// substrate-suppression facet to its test.
// ===========================================================================

const rejectionTrap = createUnhandledRejectionTrap();
const { unhandled } = rejectionTrap;
beforeEach(rejectionTrap.install);
afterEach(rejectionTrap.dispose);

describe("V17a-T — swallowing-handler substrate suppression (cka-33 / V17a)", () => {
  it("cka-33 / V17a: routeAbandonableSettlement discards after cancellation with no second RuntimeEvent and no diagnostic of any severity", () => {
    const rec = makeSubstrateChannels();
    const guard: SubstrateCancellationGuard = { cancellationSurfaced: true };

    // A diagnostic-worthy OOM-style late rejection — still discarded; promotion
    // to theta/runtime/internal-error would re-introduce the second-event surface
    // the rule forbids.
    const disposition = routeAbandonableSettlement(
      { kind: "rejected", error: new Error("host OOM after cancellation") },
      guard,
      rec.channels,
    );

    expect(rec.events).toEqual([]); // no second RuntimeEvent
    expect(rec.diagnostics).toEqual([]); // no diagnostic of any severity
    expect(disposition).toBe("discarded");
  });

  it("cka-33 / V17a: a late rejection landed via the Checkpoint seam raises no Node unhandledRejection (handler attached at construction)", async () => {
    const guard: SubstrateCancellationGuard = { cancellationSurfaced: false };
    const rec = makeSubstrateChannels();
    const checkpoint = new ScriptedCheckpoint(() => {
      // Cancellation surfaces at the checkpoint; the abandonable Promise is now
      // abandoned but still settles late.
      guard.cancellationSurfaced = true;
    });

    // Constructed and guarded in one expression so the swallowing handler must
    // attach at construction, before the first microtask boundary.
    const guarded = attachSwallowingHandler(
      (async () => {
        await checkpoint.before("tool-call");
        throw new Error("late abandonable rejection after cancellation");
      })(),
      guard,
      rec.channels,
    );

    // The abandoned case: never await `guarded` for its value.
    void guarded;
    await settleAndObserve();

    // All three side channels stay silent at the substrate.
    expect(unhandled).toEqual([]);
    expect(rec.events).toEqual([]);
    expect(rec.diagnostics).toEqual([]);
  });
});

// ===========================================================================
// CNCL-5 — no retroactive rewrite of a completed Ok.
// ===========================================================================

describe("V17a-T — CNCL-5 no retroactive rewrite of a completed Ok", () => {
  it("CNCL-5: a completed Ok(v) is retained (not rewritten to Err cancelled) when an abort lands at the next checkpoint", async () => {
    const thetaAbort = createThetaAbort();
    const okValue = { computed: 42 };

    // Land the abort at the SECOND checkpoint (statement `y`), after `x`
    // completed Ok(v) at the first checkpoint.
    const checkpoint = new ScriptedCheckpoint((call) => {
      if (call === 2) {
        thetaAbort.abort(new Error("abort at next checkpoint"));
      }
    });

    const statements: CancellableStatement[] = [
      {
        binding: "x",
        kind: "tool-call",
        site: SITE,
        run: (): Promise<OperationResult> =>
          Promise.resolve({ ok: true, value: okValue }),
      },
      {
        binding: "y",
        kind: "tool-call",
        site: SITE,
        run: (): Promise<OperationResult> =>
          Promise.resolve({ ok: true, value: { computed: 99 } }),
      },
    ];

    const outcome = await runCancellableSequence(
      { checkpoint, signal: thetaAbort.signal },
      statements,
    );

    // CNCL-5: x's completed Ok(v) is retained verbatim — never rewritten to
    // Err({kind:"cancelled"}).
    expect(outcome.bindings.get("x")).toEqual({ ok: true, value: okValue });
  });
});

// ===========================================================================
// CNCL-6 — no top-level synthesis on tail abort.
// ===========================================================================

describe("V17a-T — CNCL-6 no top-level synthesis on tail abort", () => {
  it("CNCL-6: an abort in a pure tail after the final cancellable operation leaves the produced value and synthesises no top-level cancelled", async () => {
    const thetaAbort = createThetaAbort();
    const tailValue = { result: "done" };

    // The single statement's checkpoint fires normally; the abort lands in the
    // pure tail AFTER the final cancellable operation completed, so no further
    // checkpoint executes.
    const checkpoint = new ScriptedCheckpoint(() => {
      // no abort at any checkpoint
    });

    const statements: CancellableStatement[] = [
      {
        binding: "x",
        kind: "tool-call",
        site: SITE,
        run: (): Promise<OperationResult> => {
          // The abort fires right after the final operation completes — a pure
          // tail with no further checkpoint to observe it.
          thetaAbort.abort(new Error("tail abort"));
          return Promise.resolve({ ok: true, value: tailValue });
        },
      },
    ];

    const outcome = await runCancellableSequence(
      { checkpoint, signal: thetaAbort.signal },
      statements,
    );

    // CNCL-6: the top-level result is the produced value; no synthesised
    // top-level `cancelled`.
    expect(outcome.result).toEqual({ ok: true, value: tailValue });
    expect(outcome.synthesizedTopLevelCancelled).toBe(false);
  });
});
