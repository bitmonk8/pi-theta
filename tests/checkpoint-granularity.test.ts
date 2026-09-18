// V17c-T — failing tests for the paired `V17c` cancellation-checkpoint
// granularity surface.
//
// Spec: cancellation.md §Granularity (the fixed five-site checkpoint set and the
// loop-iteration macrotask-yield property; coverage-matrix.md code-keyed-area
// token `cka-47`, `V17c` facet), §Edge cases (straight-line statement
// boundaries are not checkpoints); pi-integration-contract/
// host-interfaces-services.md §`Checkpoint` seam (PIC-10).
//
// This leaf owns the two cycle-free per-site checkpoint-presence arms — the
// `for`/`while` loop-iteration site (V3c) and the binder's LLM-call site (V9j)
// — plus the loop-iteration macrotask-yield property and a best-effort negative
// arm. The `@`-query-dispatch, tool-call, and `invoke` per-site presence arms
// are witnessed on V13c / V14g / V15m and are out of scope here.
//
// Each test cites the `cka-47` code-keyed-area token and this leaf's `V17c`
// closing-leaf-ID inline so the H5f per-facet citing-test gate associates this
// facet to its test. The tests red on their own primary assertions while `V17c`
// is absent: `runCheckpointedForLoop` fires no `loop-iter` checkpoint and runs
// no iteration, and `runCheckpointedBinderCall` fires no `binder-call`
// checkpoint and never dispatches the call — so the interleave, count, and
// early-stop expectations red rather than a compile error, a missing fixture,
// or a harness throw.

import { RecordingCheckpoint } from "./helpers/invoke-seam-scaffold";
import { describe, expect, it } from "vitest";
import type { CheckpointSite } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";
import {
  runCheckpointedBinderCall,
  runCheckpointedForLoop,
  type CheckpointedLoopHost,
} from "../src/runtime/checkpoint-granularity";
import { ProductionCheckpoint } from "../src/seams/production-checkpoint";
import { FakeClock } from "./helpers/fake-clock";

const LOOP_SITE: CheckpointSite = { file: "theta.theta", line: 3, column: 1 };
const BINDER_SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/** A never-aborted signal for the presence / negative arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

// ===========================================================================
// cka-47 / V17c — loop-iteration checkpoint-presence arm.
// ===========================================================================

describe("V17c-T — loop-iteration checkpoint site (cka-47 / V17c)", () => {
  it("cka-47 / V17c: a loop-iter checkpoint fires immediately before each for/while iteration, at the loop site", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log, "before:");
    const snapshot: readonly ThetaValue[] = ["a", "b", "c"];
    const host: CheckpointedLoopHost = {
      snapshot,
      runIteration(element, index): void {
        log.push(`iter:${index}:${String(element)}`);
      },
    };

    await runCheckpointedForLoop(checkpoint, liveSignal(), LOOP_SITE, host);

    // The checkpoint precedes every iteration, in order: before → iter for each.
    expect(log).toEqual([
      "before:loop-iter",
      "iter:0:a",
      "before:loop-iter",
      "iter:1:b",
      "before:loop-iter",
      "iter:2:c",
    ]);
    // Exactly one loop-iter checkpoint per iteration and no other kind.
    expect(checkpoint.kinds).toEqual(["loop-iter", "loop-iter", "loop-iter"]);
    // Each checkpoint carries the loop site.
    expect(checkpoint.sites).toEqual([LOOP_SITE, LOOP_SITE, LOOP_SITE]);
  });
});

// ===========================================================================
// cka-47 / V17c — binder-inference checkpoint-presence arm.
// ===========================================================================

describe("V17c-T — binder LLM-call checkpoint site (cka-47 / V17c)", () => {
  it("cka-47 / V17c: a binder-call checkpoint fires immediately before the binder's LLM call, at the binder site", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log, "before:");

    const outcome = await runCheckpointedBinderCall(
      checkpoint,
      liveSignal(),
      BINDER_SITE,
      async () => {
        log.push("binder:invoked");
        return { bound: true };
      },
    );

    // The checkpoint precedes the binder call, then the call runs.
    expect(log).toEqual(["before:binder-call", "binder:invoked"]);
    expect(checkpoint.kinds).toEqual(["binder-call"]);
    expect(checkpoint.sites).toEqual([BINDER_SITE]);
    expect(outcome).toEqual({ cancelled: false, value: { bound: true } });
  });

  it("cka-47 / V17c: an abort observed at the binder-call checkpoint skips the LLM call", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log, "before:");
    const controller = new AbortController();
    controller.abort(); // already aborted before the pre-call checkpoint

    const outcome = await runCheckpointedBinderCall(
      checkpoint,
      controller.signal,
      BINDER_SITE,
      async () => {
        log.push("binder:invoked");
        return { bound: true };
      },
    );

    // The checkpoint fired, then the abort was observed and the call skipped.
    expect(checkpoint.kinds).toEqual(["binder-call"]);
    expect(log).toEqual(["before:binder-call"]); // binder:invoked never appended
    expect(outcome).toEqual({ cancelled: true });
  });
});

// ===========================================================================
// cka-47 / V17c — best-effort negative arm: no checkpoint inside a primitive
// operation or at a straight-line statement boundary.
// ===========================================================================

describe("V17c-T — no checkpoint at non-checkpoint node kinds (cka-47 / V17c)", () => {
  it("cka-47 / V17c: primitive operations and straight-line statements inside the loop body fire no checkpoint (only the per-iteration loop-iter)", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log, "before:");
    const snapshot: readonly ThetaValue[] = [10, 20];
    const host: CheckpointedLoopHost = {
      snapshot,
      runIteration(element, index): void {
        // Drive primitive operations (arithmetic, comparison, field/index
        // access) and a straight-line statement sequence inside the body: none
        // of these node kinds is a checkpoint, so the seam must witness none.
        const n = element as number;
        const doubled = n + n; // arithmetic
        const isBig = doubled > 25; // comparison
        const record = { doubled, isBig }; // straight-line statement
        const field = record.doubled; // field access
        const cell = snapshot[index]; // index access
        log.push(`body:${index}:${field}:${String(cell)}`);
      },
    };

    await runCheckpointedForLoop(checkpoint, liveSignal(), LOOP_SITE, host);

    // The body ran twice with its primitive/straight-line work…
    expect(log).toEqual([
      "before:loop-iter",
      "body:0:20:10",
      "before:loop-iter",
      "body:1:40:20",
    ]);
    // …and the ONLY checkpoints witnessed are the two per-iteration loop-iter
    // checkpoints — no query / tool-call / invoke / binder-call for the
    // primitive operations or straight-line statement boundaries in the body.
    expect(checkpoint.kinds).toEqual(["loop-iter", "loop-iter"]);
  });

  it("cka-47 / V17c: primitive/straight-line work inside a binder call fires no additional checkpoint (only the one binder-call)", async () => {
    const log: string[] = [];
    const checkpoint = new RecordingCheckpoint(log, "before:");

    await runCheckpointedBinderCall(checkpoint, liveSignal(), BINDER_SITE, async () => {
      // Straight-line statements and primitive operations inside the call body.
      const a = 2;
      const b = a * 3;
      const ok = b === 6;
      log.push(`binder:invoked:${b}:${String(ok)}`);
      return b;
    });

    expect(log).toEqual(["before:binder-call", "binder:invoked:6:true"]);
    // No checkpoint fires for the primitive/straight-line work in the call body.
    expect(checkpoint.kinds).toEqual(["binder-call"]);
  });
});

// ===========================================================================
// cka-47 / V17c — loop-iteration macrotask-yield property (cancellation.md
// §Granularity, the seam's `loop-iter` case). Exercised against the real
// `ProductionCheckpoint` (V8a), whose `loop-iter` before(...) yields one
// macrotask turn through the injected `Clock`. A Pi-dispatched abort (modelled
// as a macrotask scheduled through the same fake clock) flipped during a
// synchronous compute-bound body with no genuine `await` is therefore observed
// before the next iteration.
// ===========================================================================

/**
 * Drive an in-flight loop to completion against the `FakeClock`: alternately
 * drain microtasks and fire due 0-ms timers (the `loop-iter` macrotask yields
 * and any macrotask abort scheduled through the clock) until the work settles.
 */
async function pumpToCompletion(clock: FakeClock, work: Promise<void>): Promise<void> {
  let done = false;
  const tracked = work.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let i = 0; i < 100 && !done; i += 1) {
    await Promise.resolve();
    clock.advance(0);
    await Promise.resolve();
  }
  await tracked;
  await work;
}

describe("V17c-T — loop-iteration macrotask yield (cka-47 / V17c)", () => {
  it("cka-47 / V17c: a macrotask abort flipped during a synchronous compute-bound body is observed before the next iteration", async () => {
    const clock = new FakeClock();
    const checkpoint = new ProductionCheckpoint(clock);
    const controller = new AbortController();

    const ran: number[] = [];
    const snapshot: readonly ThetaValue[] = [0, 1, 2, 3];
    const host: CheckpointedLoopHost = {
      snapshot,
      runIteration(_element, index): void {
        ran.push(index);
        // A compute-bound body with NO genuine `await`. Iteration 0 schedules a
        // Pi-dispatched-style abort as a macrotask through the clock — the abort
        // can only land when the event loop turns, i.e. at the next loop-iter
        // checkpoint's macrotask yield.
        if (index === 0) {
          clock.setTimeout(() => controller.abort(), 0);
        }
        // Pure compute; no await between iterations.
        let acc = 0;
        for (let k = 0; k < 5; k += 1) acc += k;
        void acc;
      },
    };

    await pumpToCompletion(
      clock,
      runCheckpointedForLoop(checkpoint, controller.signal, LOOP_SITE, host),
    );

    // Only iteration 0 ran: the loop-iter checkpoint before iteration 1 yielded
    // a macrotask turn, the pending abort landed, and the signal-check stopped
    // the loop before iteration 1. Without the macrotask yield the compute-bound
    // loop would drain only microtasks and run all four iterations.
    expect(ran).toEqual([0]);
    expect(controller.signal.aborted).toBe(true);
  });
});
