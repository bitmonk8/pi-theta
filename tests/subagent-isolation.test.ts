// RFC-0005 re-base — subagent-mode isolation and child-process lifecycle.
//
// Re-bases the former in-process `AgentSession` isolation suite onto the
// RFC-0005 child-process drive (docs/rfcs/0005-child-process-subagent-sessions.md;
// pi-integration-contract/subagent.md). The spec successors covered here:
//   - PIC-40 — pre-spawn model guard (unresolved model → refuse the child
//     spawn) AND the new child-side model pre-flight (marshalled reference vs.
//     child-resolved model; mismatch → precise diagnostic + failed invocation);
//   - PIC-41 — cancellation forwards via the one-shot `thetaAbort.signal`
//     listener that sends the RPC `abort` command (spawn-then-immediate-cancel
//     ordering);
//   - PIC-43 — `agent_end` extraction (willRetry===false terminal selection,
//     cancellation short-circuit, transport short-circuit on trailing
//     `stopReason: "error"`, chronological assistant-text concatenation);
//   - PIC-9 — child teardown (stdin close → bounded await SHUTDOWN_AWAIT_CAP_MS
//     → process-tree kill; disposeBarrier settles on observed child exit;
//     dispose-failure advisory on a teardown-step throw);
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
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import type { TransportError } from "../src/runtime/query-error";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import {
  extractSubagentQueryResult,
  preFlightModelCheck,
  preSpawnModelGuard,
  renderModelPreflightMismatchMessage,
  renderSubagentDisposeFailureMessage,
  runSubagentChildTeardown,
  spawnSubagentsInParallel,
  SUBAGENT_DISPOSE_BUDGET_MS,
  SUBAGENT_DISPOSE_FAILURE_CODE,
  SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
  SUBAGENT_MODEL_UNRESOLVED_CODE,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
  SUBAGENT_TEARDOWN_TIMEOUT_CODE,
  type AgentEndEvent,
  type ParallelSubagentSpawn,
  type SubagentChildTeardownDeps,
} from "../src/runtime/subagent-isolation";
import type { ChildExitInfo, SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { WallClock } from "../src/seams/wall-clock";
import { FakeRpcChild, makeFakeChildLauncher } from "./helpers/fake-rpc-child";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function assistantMessage(text: string, stopReason: AssistantMessage["stopReason"]): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
}

function agentEnd(messages: readonly Message[], willRetry: boolean): AgentEndEvent {
  return { type: "agent_end", messages, willRetry };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ===========================================================================
// PIC-40 — pre-spawn model guard (unresolved model).
// ===========================================================================

describe("RFC-0005 — PIC-40 pre-spawn model guard", () => {
  it("PIC-40: an unresolved (undefined) model refuses the child spawn with theta/runtime/subagent-model-unresolved", () => {
    const outcome = preSpawnModelGuard(undefined);
    expect(outcome.proceed).toBe(false);
    expect(outcome.diagnostic?.code).toBe(SUBAGENT_MODEL_UNRESOLVED_CODE);
    expect(outcome.diagnostic?.message).toBe(SUBAGENT_MODEL_UNRESOLVED_MESSAGE);
  });

  // The runtime-does-not-spawn behaviour is witnessed on the REAL production
  // path (a modelless `spawnSubagentConversation` refuses before any launch) in
  // `subagent-model-theta-tool.test.ts` — the former in-process
  // `guardedSubagentSpawn` seam it used to exercise was dead and is retired.
});

// ===========================================================================
// PIC-40 — child-side model pre-flight (marshalled-reference confirmation).
// ===========================================================================

describe("RFC-0005 — PIC-40 child-side model pre-flight", () => {
  it("PIC-40: a matching child-resolved model proceeds without a diagnostic", () => {
    const outcome = preFlightModelCheck("claude-sonnet", "claude-sonnet");
    expect(outcome.proceed).toBe(true);
    expect(outcome.diagnostic).toBeUndefined();
  });

  it("PIC-40: a mismatch fails the invocation with theta/runtime/subagent-model-preflight-mismatch naming expected vs. resolved", () => {
    const outcome = preFlightModelCheck("claude-sonnet", "claude-haiku");

    // PIC-40: the marshalled reference resolving child-side to a different model
    // is terminal for the invocation.
    expect(outcome.proceed).toBe(false);
    expect(outcome.diagnostic?.code).toBe(SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE);
    expect(outcome.diagnostic?.message).toBe(
      renderModelPreflightMismatchMessage("claude-sonnet", "claude-haiku"),
    );
    // The registry Message column names expected vs. resolved.
    expect(outcome.diagnostic?.message).toContain("claude-sonnet");
    expect(outcome.diagnostic?.message).toContain("claude-haiku");
  });
});

// ===========================================================================
// PIC-43 — terminal agent_end extraction (short-circuit order).
// ===========================================================================

describe("RFC-0005 — PIC-43 agent_end query-result extraction", () => {
  it("PIC-43: the cancellation short-circuit yields Err(cancelled) before any text extraction", () => {
    const event = agentEnd([userMessage("q"), assistantMessage("ignored", "stop")], false);
    const result = extractSubagentQueryResult(event, { aborted: true, provider: "anthropic" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("cancelled");
    }
  });

  it("PIC-43: a trailing assistant stopReason \"error\" maps to Err(transport) after the cancellation short-circuit", () => {
    const event = agentEnd([userMessage("q"), assistantMessage("boom", "error")], false);
    const result = extractSubagentQueryResult(event, { aborted: false, provider: "anthropic" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
      // The #subagent-queryerror-audit / PIC-43 transport row pins the whole
      // shape: http_status null, retryable false, the resolved-model provider
      // populated, and — because the `assistant` message carries no
      // `errorMessage` — the fixed fallback message "provider transport failure".
      const transport = result.error as TransportError;
      expect(transport.http_status).toBeNull();
      expect(transport.retryable).toBe(false);
      expect(transport.provider).toBe("anthropic");
      expect(transport.message).toBe("provider transport failure");
    }
  });

  it("PIC-43: an errorMessage-carrying stopReason \"error\" turn maps its errorMessage verbatim (no fallback)", () => {
    const withMessage = assistantMessage("boom", "error");
    (withMessage as { errorMessage?: string }).errorMessage = "429 rate limited";
    const event = agentEnd([userMessage("q"), withMessage], false);
    const result = extractSubagentQueryResult(event, { aborted: false, provider: "anthropic" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const transport = result.error as TransportError;
      // The fallback string is used ONLY when `errorMessage` is absent; here the
      // provider-formatted message rides through verbatim.
      expect(transport.message).toBe("429 rate limited");
      expect(transport.http_status).toBeNull();
      expect(transport.retryable).toBe(false);
    }
  });

  it("PIC-43: with both short-circuits passed, the trailing turn's assistant text is concatenated chronologically into Ok(string)", () => {
    const event = agentEnd(
      [userMessage("q"), assistantMessage("first", "stop"), assistantMessage("second", "stop")],
      false,
    );
    const result = extractSubagentQueryResult(event, { aborted: false, provider: "anthropic" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("first\nsecond");
    }
  });

  it("PIC-43 tail: a terminal turn with no assistant text yields Ok(\"\") (the empty-final-turn rule)", () => {
    // A pure tool-use final turn produces no assistant text; the extraction
    // yields the empty string rather than failing.
    const event = agentEnd([userMessage("q"), assistantMessage("", "toolUse")], false);
    const result = extractSubagentQueryResult(event, { aborted: false, provider: "anthropic" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("");
    }
  });
});

// ===========================================================================
// PIC-9 — subagent child-process teardown.
// ===========================================================================

describe("RFC-0005 — PIC-9 subagent child-process teardown", () => {
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

  it("PIC-9: teardown closes stdin, the child exits on stdin-EOF, no kill, disposeBarrier settles on observed exit, abort listener detached", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: true });
    const h = makeDeps();

    await runSubagentChildTeardown(child, h.deps);

    // Graceful path: stdin close is the shutdown trigger; the child exits on EOF
    // (the pinned RPC presupposition), so no kill and no timeout diagnostic.
    expect(child.stdinClosed).toBe(true);
    expect(child.exited).toBe(true);
    expect(child.killed).toBe(false);
    expect(h.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE)).toBeUndefined();
    // disposeBarrier settles on observed child exit; the one-shot abort listener
    // is detached in the same teardown.
    expect(h.barrierSettled).toBe(1);
    expect(h.detachCalls).toBe(1);
  });

  it("PIC-9: a child that does not exit within the budget is process-tree killed and emits theta/runtime/subagent-teardown-timeout", async () => {
    // A child that ignores stdin-EOF models a wedged child talking to its provider.
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const h = makeDeps({ budgetMs: 20 });

    await runSubagentChildTeardown(child, h.deps);

    // Bounded await elapsed → process-tree kill fallback + the per-child timeout
    // diagnostic; the barrier still settles on the (kill-induced) observed exit.
    expect(child.killed).toBe(true);
    expect(child.exited).toBe(true);
    const timeout = h.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE);
    expect(timeout).toBeDefined();
    expect(h.barrierSettled).toBe(1);
  });

  it("PIC-9: a teardown-step throw (stdin close) is logged as advisory theta/runtime/subagent-dispose-failure and does not propagate", async () => {
    let exited = false;
    const throwingChild: SubagentChildProcess = {
      pid: 9,
      writeStdin: (): void => {},
      closeStdin: (): void => {
        throw new Error("stdin close exploded\nsecond line");
      },
      onStdoutLine: () => () => {},
      onStderrLine: () => () => {},
      onExit: (listener: (info: ChildExitInfo) => void): void => {
        // Never fires — the throw precedes exit.
        void listener;
      },
      kill: (): void => {
        exited = true;
      },
    };
    const h = makeDeps();

    // The teardown-step throw must NOT escape (it would mask an in-flight body defect).
    await expect(runSubagentChildTeardown(throwingChild, h.deps)).resolves.toBeUndefined();

    const disposeFailure = h.emitted.find((d) => d.code === SUBAGENT_DISPOSE_FAILURE_CODE);
    expect(disposeFailure).toBeDefined();
    // The bounded-kill fallback still runs when stdin close throws.
    expect(exited).toBe(true);
  });

  it("PIC-9: a teardown-step throw in the bounded KILL step is logged as advisory theta/runtime/subagent-dispose-failure and does not propagate", async () => {
    // A child that ignores stdin-EOF forces the bounded-kill fallback; the KILL
    // step itself then throws. The registry re-scopes subagent-dispose-failure
    // to any teardown-step throw — stdin close OR bounded kill.
    const throwingKillChild: SubagentChildProcess = {
      pid: 11,
      writeStdin: (): void => {},
      closeStdin: (): void => {},
      onStdoutLine: () => () => {},
      onStderrLine: () => () => {},
      onExit: (): void => {
        // Never fires — the child does not exit on stdin-EOF, forcing the kill.
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

  it("PIC-9: the dispose-failure Message column is the registry-pinned string verbatim (\"subagent teardown failed: <first line>\")", () => {
    // diagnostics/code-registry-runtime.md pins the theta/runtime/subagent-
    // dispose-failure Message template as `subagent teardown failed: <teardown
    // error first line>` — only the first line of a multi-line error rides in.
    const rendered = renderSubagentDisposeFailureMessage(
      new Error("stdin close exploded\nsecond line"),
    );
    expect(rendered).toBe("subagent teardown failed: stdin close exploded");
  });

  it("PIC-9: SHUTDOWN_AWAIT_CAP_MS covers teardown — the subagent teardown budget equals the shared cap", () => {
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
    const launcher = makeFakeChildLauncher();
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const makeSpawn = (): ParallelSubagentSpawn => ({
      launchChild: async (): Promise<FakeRpcChild> =>
        launcher.spawn("node", ["pi", "--mode", "rpc"], { cwd: "/w", env: {} }) as FakeRpcChild,
      enterFirstPrompt: async (child): Promise<void> => {
        child.writeStdin('{"type":"prompt","message":"go"}\n');
        entered += 1;
        // Block the first-prompt acknowledgement until the test releases it.
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

