// RFC-0005 re-base — subagent-mode isolation and child-process lifecycle.
//
// Re-bases the former in-process `AgentSession` isolation suite onto the
// RFC-0005 child-process drive (docs/rfcs/0005-child-process-subagent-sessions.md;
// pi-integration-contract/subagent.md). The spec successors covered here:
//   - PIC-62 — pre-spawn model guard (unresolved model → refuse the child
//     spawn) and child-side model pre-flight are re-homed to the single-source
//     PIC-62 leaf (`guardResolvedModel` / `confirmChildModel`), covered by
//     tests/subagent-model-guard.test.ts; the dead RFC-0005 `preSpawnModelGuard`
//     duplicate (and its test here) is deleted;
//   - PIC-41 — cancellation forwards via the one-shot `thetaAbort.signal`
//     listener that sends the RPC `abort` command (spawn-then-immediate-cancel
//     ordering) — retired; the successor abort→kill forwarding (PIC-66) is
//     covered by tests/subagent-json-driver.test.ts / subagent-json-wire.test.ts;
//   - PIC-43 — `agent_end` extraction (willRetry===false terminal selection,
//     cancellation short-circuit, transport short-circuit on trailing
//     `stopReason: "error"`, chronological assistant-text concatenation);
//   - PIC-65 (successor of the retired PIC-9) — child teardown (bounded await
//     SHUTDOWN_AWAIT_CAP_MS → kill, process-tree on Windows; the residual
//     stdin release is an advisory no-op against the production child, whose
//     stdin is spawned closed per bug 0002; disposeBarrier settles on observed
//     child exit; dispose-failure advisory on a teardown-step throw);
//   - PIC-22 — all N parallel spawns initiated before any returns, re-based on
//     a fake process launcher, tolerant of real spawn ordering;
//   - FN-5 — subagent caller final-value projection.
//
// RED EXPECTATION (RFC-0005 not yet implemented). Tests targeting the new
// process-lifecycle seams (`preFlightModelCheck`, `runSubagentChildTeardown`)
// red on their primary assertions against the non-compliant stubs; the paired
// implementation leaf greens them. Mechanism-neutral seams (PIC-43 extraction,
// PIC-22 parallel dispatch, FN-5, the PIC-40 unresolved guard) carry over and
// stay green. No test reds on a compile error, a missing fixture, or a harness
// throw.

import { describe, expect, it } from "vitest";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import {
  renderSubagentDisposeFailureMessage,
  runSubagentChildTeardown,
  spawnSubagentsInParallel,
  SUBAGENT_DISPOSE_BUDGET_MS,
  SUBAGENT_DISPOSE_FAILURE_CODE,
  SUBAGENT_TEARDOWN_TIMEOUT_CODE,
  type ParallelSubagentSpawn,
  type SubagentChildTeardownDeps,
} from "../src/runtime/subagent-isolation";
import type { ChildExitInfo, SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { WallClock } from "../src/seams/wall-clock";
import { FakeJsonChild, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

// PIC-62: the pre-spawn model guard is the single-source `guardResolvedModel`
// leaf, covered by tests/subagent-model-guard.test.ts. The dead RFC-0005
// `preSpawnModelGuard` duplicate that this suite used to exercise is deleted;
// the runtime-does-not-spawn behaviour is witnessed on the REAL production path
// (a modelless `spawnSubagentConversation` refuses before any launch) in
// `subagent-model-theta-tool.test.ts`.

// RFC-0006: the child-side model pre-flight (former `preFlightModelCheck` over
// the RPC `get_state` surface) and the parent-side terminal-`agent_end`
// extraction (`extractSubagentQueryResult`) are RETIRED with the RPC drive. The
// child now re-resolves the model locally (`confirmChildModel`, covered by
// tests/subagent-model-guard.test.ts) and resolves each query with the
// prompt-mode driver inside the child; the parent consumes only the envelope
// (tests/subagent-json-driver.test.ts).

// ===========================================================================
// PIC-65 — subagent child-process teardown.
// ===========================================================================

describe("RFC-0005 — PIC-65 subagent child-process teardown", () => {
  function makeDeps(overrides?: Partial<SubagentChildTeardownDeps>): {
    deps: SubagentChildTeardownDeps;
    emitted: Diagnostic[];
    detachCalls: number;
    barrierSettled: number;
  } {
    const emitted: Diagnostic[] = [];
    let detachCalls = 0;
    let barrierSettled = 0;
    const deps: SubagentChildTeardownDeps = {
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
      detachAbortListener: (): void => {
        detachCalls += 1;
      },
      settleDisposeBarrier: (): void => {
        barrierSettled += 1;
      },
      // Real-timer clock: the teardown's bounded await is timed by the injected
      // PIC-12 `Clock` seam; `WallClock` preserves the real-elapsed budget the
      // timeout / kill-fallback assertions below depend on.
      clock: new WallClock(),
      ...overrides,
    };
    return {
      deps,
      emitted,
      get detachCalls() {
        return detachCalls;
      },
      get barrierSettled() {
        return barrierSettled;
      },
    };
  }

  it("PIC-65: a child that exits promptly during teardown is not killed; disposeBarrier settles on observed exit, abort listener detached", async () => {
    // `exitOnStdinEof: true` is a fake-side scripting convenience that makes the
    // child exit as teardown begins — modelling the NORMAL path where the child
    // already self-exited after its envelope (a real `-p` child never exits on
    // stdin EOF; bug 0002).
    const child = new FakeJsonChild({ exitOnStdinEof: true });
    const h = makeDeps();

    await runSubagentChildTeardown(child, h.deps);

    // Prompt-exit path: the child is gone before the bounded budget elapses, so
    // no kill and no timeout diagnostic (the residual stdin release still ran).
    expect(child.stdinClosed).toBe(true);
    expect(child.exited).toBe(true);
    expect(child.killed).toBe(false);
    expect(h.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE)).toBeUndefined();
    // disposeBarrier settles on observed child exit; the one-shot abort listener
    // is detached in the same teardown.
    expect(h.barrierSettled).toBe(1);
    expect(h.detachCalls).toBe(1);
  });

  it("PIC-65: a child that does not exit within the budget is killed and emits theta/runtime/subagent-teardown-timeout", async () => {
    // A child that keeps running models a wedged child talking to its provider.
    const child = new FakeJsonChild({ exitOnStdinEof: false });
    const h = makeDeps({ budgetMs: 20 });

    await runSubagentChildTeardown(child, h.deps);

    // Bounded await elapsed → kill fallback + the per-child timeout
    // diagnostic; the barrier still settles on the (kill-induced) observed exit.
    expect(child.killed).toBe(true);
    expect(child.exited).toBe(true);
    const timeout = h.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE);
    expect(timeout).toBeDefined();
    expect(h.barrierSettled).toBe(1);
  });

  it("PIC-65: a teardown-step throw (stdin release) is logged as advisory theta/runtime/subagent-dispose-failure and does not propagate", async () => {
    let exited = false;
    const throwingChild: SubagentChildProcess = {
      pid: 9,
      closeStdin: (): void => {
        throw new Error("stdin close exploded\nsecond line");
      },
      onStdoutLine: () => () => {},
      onStderrLine: () => () => {},
      onExit: (listener: (info: ChildExitInfo) => void): void => {
        // Never fires — the child keeps running past the release throw.
        void listener;
      },
      kill: (): void => {
        exited = true;
      },
    };
    const h = makeDeps({ budgetMs: 20 });

    // The teardown-step throw must NOT escape (it would mask an in-flight body defect).
    await expect(runSubagentChildTeardown(throwingChild, h.deps)).resolves.toBeUndefined();

    const disposeFailure = h.emitted.find((d) => d.code === SUBAGENT_DISPOSE_FAILURE_CODE);
    expect(disposeFailure).toBeDefined();
    // The release is advisory: teardown fell through to the bounded await and
    // the kill fallback (with its timeout event) — a release throw never skips
    // the await PIC-65 pins as THE teardown mechanism.
    expect(exited).toBe(true);
    expect(h.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE)).toBeDefined();
  });

  it("PIC-65: a teardown-step throw in the bounded KILL step is logged as advisory theta/runtime/subagent-dispose-failure and does not propagate", async () => {
    // A child that keeps running forces the bounded-kill fallback; the KILL
    // step itself then throws. The registry re-scopes subagent-dispose-failure
    // to any teardown-step throw — stdin release OR bounded kill.
    const throwingKillChild: SubagentChildProcess = {
      pid: 11,
      closeStdin: (): void => {},
      onStdoutLine: () => () => {},
      onStderrLine: () => () => {},
      onExit: (): void => {
        // Never fires — the child keeps running, forcing the bounded kill.
      },
      kill: (): void => {
        throw new Error("process-tree kill exploded");
      },
    };
    const h = makeDeps({ budgetMs: 20 });

    // The KILL-step throw must NOT escape (it would mask an in-flight body defect).
    await expect(runSubagentChildTeardown(throwingKillChild, h.deps)).resolves.toBeUndefined();

    expect(h.emitted.find((d) => d.code === SUBAGENT_DISPOSE_FAILURE_CODE)).toBeDefined();
  });

  it("PIC-65: the dispose-failure Message column is the registry-pinned string verbatim (\"subagent teardown failed: <first line>\")", () => {
    // diagnostics/code-registry-runtime.md pins the theta/runtime/subagent-
    // dispose-failure Message template as `subagent teardown failed: <teardown
    // error first line>` — only the first line of a multi-line error rides in.
    const rendered = renderSubagentDisposeFailureMessage(
      new Error("stdin close exploded\nsecond line"),
    );
    expect(rendered).toBe("subagent teardown failed: stdin close exploded");
  });

  it("PIC-65: SHUTDOWN_AWAIT_CAP_MS covers teardown — the subagent teardown budget equals the shared cap", () => {
    expect(SUBAGENT_DISPOSE_BUDGET_MS).toBe(SHUTDOWN_AWAIT_CAP_MS);
  });
});

// ===========================================================================
// PIC-22 — parallel subagent spawn initiation (fake process launcher).
// ===========================================================================

describe("RFC-0005 — PIC-22 parallel subagent spawn initiation", () => {
  // PIC-22 fixes N ≥ 2; the witness runs at N=3 so a cap/queue/scheduler that
  // admitted, say, only the first two spawns would still be caught.
  const PARALLEL_N = 3;

  it(`PIC-22: for N=${PARALLEL_N} parallel subagent tool calls, all children are launched and each first prompt entered before any blocked call is released`, async () => {
    const launcher = makeFakeJsonChildLauncher();
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const makeSpawn = (): ParallelSubagentSpawn => ({
      launchChild: async (): Promise<FakeJsonChild> =>
        launcher.spawn("node", ["pi", "--mode", "json"], { cwd: "/w", env: {} }) as FakeJsonChild,
      // PIC-22 successor: the retired RPC "enter the child's first prompt" drive
      // point is replaced by "drive initiated" (spawn initiated). The `-p` child's
      // stdin is close-only (no prompt write); the drive point is reaching the
      // per-child envelope await, modelled here as a blocking gate.
      driveInitiated: async (): Promise<void> => {
        entered += 1;
        await gate;
      },
    });

    // Do NOT await — the first-prompt calls block on `gate`.
    const all = spawnSubagentsInParallel(
      Array.from({ length: PARALLEL_N }, () => makeSpawn()),
    );
    await flush();

    // PIC-22: before any blocked call is released, all N children have been
    // launched and all N first prompts entered. A cap / queue / scheduler would
    // leave at least one child unspawned behind a blocked drive point.
    expect(launcher.spawns).toHaveLength(PARALLEL_N);
    expect(entered).toBe(PARALLEL_N);

    release();
    await all;
  });
});

