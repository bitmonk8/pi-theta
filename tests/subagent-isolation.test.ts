// V9i-T — failing tests for the paired `V9i` subagent-mode session isolation
// and lifecycle leaf.
//
// Spec: pi-integration-contract/subagent.md (PIC-9 session lifecycle, PIC-22
// parallel spawn initiation, PIC-23 ResourceLoader adapter, PIC-40 pre-spawn
// model guard, PIC-41 no-`signal`/abort forwarding, PIC-42 session-local
// completion, PIC-43 terminal `agent_end` extraction);
// pi-integration-contract/host-interfaces-core.md (`AgentSession` member
// surface); cancellation.md; return.md / functions.md (FN-5, via the `V3d`
// function-result seam).
//
// These tests red on their own primary assertions while `V9i` is absent because
// the V9i-T seam stub is deliberately NON-COMPLIANT (see the module header for
// the per-function non-compliance). No test reds on a compile error, a missing
// fixture, or a harness throw.
//
// ERR-8 note: the delegated live-carrier witness (a mid-stream cancellation
// inside the real subagent `AgentSession` leaves committed turns unmutated) is a
// real-host-only behaviour witnessed at the manual real-host smoke gate
// (real-host-smoke-gate.md criterion (c)) and is deliberately NOT asserted here
// — no offline source feeds a real `createAgentSession` session a scripted
// cancellable stream.

import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import {
  attachSubagentAbortForwarding,
  awaitTerminalAgentEnd,
  buildSpawnOptions,
  extractSubagentQueryResult,
  guardedSubagentSpawn,
  makeIdempotentDispose,
  preSpawnModelGuard,
  runWithSubagentTeardown,
  spawnSubagentsInParallel,
  subagentCallerFinalValue,
  SUBAGENT_DISPOSE_BUDGET_MS,
  SUBAGENT_DISPOSE_FAILURE_CODE,
  SUBAGENT_MODEL_UNRESOLVED_CODE,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
  type AbortableSubagentSession,
  type AgentEndEvent,
  type GlobalEventBus,
  type LoweredTool,
  type ParallelSubagentSpawn,
  type SpawnDeps,
  type SubagentEventSource,
  type SubagentResourceLoader,
  type SubagentSessionEvent,
  type SubagentTeardown,
} from "../src/runtime/subagent-isolation";

// ---------------------------------------------------------------------------
// Doubles / fixtures.
// ---------------------------------------------------------------------------

/** A distinct error so the throw-path teardown test rejects without a broad catch. */
class BodyPanic extends Error {
  constructor() {
    super("body panicked");
    this.name = "BodyPanic";
  }
}

/** A distinct error so the dispose-throw test can match a specific type. */
class DisposeFailure extends Error {
  constructor() {
    super("dispose exploded\nsecond line ignored");
    this.name = "DisposeFailure";
  }
}

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

/** An assistant message with the given text and stop reason. */
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

/** Flush pending microtasks/macrotasks a few times. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ===========================================================================
// PIC-40 — pre-spawn model guard.
// ===========================================================================

describe("V9i-T — PIC-40 pre-spawn model guard", () => {
  it("PIC-40: an unresolved (undefined) model refuses the spawn with loom/runtime/subagent-model-unresolved", () => {
    const outcome = preSpawnModelGuard(undefined);

    // PIC-40: `model === undefined` MUST NOT proceed; the diagnostic carries the
    // registry code and its Message-column string.
    expect(outcome.proceed).toBe(false);
    expect(outcome.diagnostic?.code).toBe(SUBAGENT_MODEL_UNRESOLVED_CODE);
    expect(outcome.diagnostic?.message).toBe(SUBAGENT_MODEL_UNRESOLVED_MESSAGE);
  });

  it("PIC-40: the runtime does not call createAgentSession when the resolved model is undefined", async () => {
    let spawnCalls = 0;
    const emitted: string[] = [];

    const result = await guardedSubagentSpawn(undefined, {
      createAgentSession: async (): Promise<void> => {
        spawnCalls += 1;
      },
      emitDiagnostic: (d): void => {
        emitted.push(d.code);
      },
    });

    // PIC-40: the guard fails the invocation before the spawn — no
    // `createAgentSession` call, and the `subagent-model-unresolved` diagnostic
    // is emitted.
    expect(result.spawned).toBe(false);
    expect(spawnCalls).toBe(0);
    expect(emitted).toContain(SUBAGENT_MODEL_UNRESOLVED_CODE);
  });
});

// ===========================================================================
// PIC-23 / PIC-41 / isolation — spawn-options construction.
// ===========================================================================

describe("V9i-T — PIC-23 / PIC-41 / isolation spawn-options", () => {
  const customTools: LoweredTool[] = [{ name: "loom-x" }, { name: "loom-y" }];

  function makeDeps(): { deps: SpawnDeps; defaultLoaderCalls: number; inMemoryFor: string[] } {
    let defaultLoaderCalls = 0;
    const inMemoryFor: string[] = [];
    const deps: SpawnDeps = {
      makeInMemorySessionManager: (cwd): object => {
        inMemoryFor.push(cwd);
        return { __inMemory: true, cwd };
      },
      makeDefaultResourceLoader: (options): SubagentResourceLoader => {
        defaultLoaderCalls += 1;
        return {
          getSystemPrompt: (): string => options.systemPromptOverride(""),
          getAppendSystemPrompt: (): string[] => [],
        };
      },
    };
    return {
      deps,
      get defaultLoaderCalls() {
        return defaultLoaderCalls;
      },
      inMemoryFor,
    };
  }

  it("PIC-23: the spawn passes the loom-constructed ResourceLoader adapter and does not use DefaultResourceLoader.systemPromptOverride", () => {
    const harness = makeDeps();
    const options = buildSpawnOptions(
      {
        customTools,
        loomSystemPrompt: "you are a subagent",
        model: "claude-x",
        cwd: "/work",
        loomAbort: new AbortController(),
      },
      harness.deps,
    );

    // PIC-23: the `systemPromptOverride` construction channel MUST NOT be used.
    expect(harness.defaultLoaderCalls).toBe(0);
    // The loom-constructed adapter delivers `system:` verbatim and appends nothing.
    expect(options.resourceLoader.getSystemPrompt()).toBe("you are a subagent");
    expect(options.resourceLoader.getAppendSystemPrompt()).toEqual([]);
  });

  it("PIC-41: the createAgentSession options include no `signal` field", () => {
    const harness = makeDeps();
    const options = buildSpawnOptions(
      {
        customTools,
        loomSystemPrompt: "sp",
        model: "claude-x",
        cwd: "/work",
        loomAbort: new AbortController(),
      },
      harness.deps,
    );

    // PIC-41: the spawn call MUST NOT include a `signal` field.
    expect("signal" in options).toBe(false);
  });

  it("isolation: the spawned session uses SessionManager.inMemory(cwd) and a tools allowlist equal to the lowered customTools names", () => {
    const harness = makeDeps();
    const options = buildSpawnOptions(
      {
        customTools,
        loomSystemPrompt: "sp",
        model: "claude-x",
        cwd: "/work",
        loomAbort: new AbortController(),
      },
      harness.deps,
    );

    // Isolation: no shared transcript — the manager is the fresh in-memory one
    // built for this cwd; no shared tool table — `tools` is exactly the lowered
    // callable-set names.
    expect(harness.inMemoryFor).toEqual(["/work"]);
    expect(options.sessionManager).toEqual({ __inMemory: true, cwd: "/work" });
    expect([...options.tools]).toEqual(["loom-x", "loom-y"]);
  });
});

// ===========================================================================
// PIC-41 — abort forwarding into the spawned session.
// ===========================================================================

describe("V9i-T — PIC-41 abort forwarding", () => {
  function makeSession(): { session: AbortableSubagentSession; abortCalls: number } {
    let abortCalls = 0;
    const session: AbortableSubagentSession = {
      abort: async (): Promise<void> => {
        abortCalls += 1;
      },
    };
    return {
      session,
      get abortCalls() {
        return abortCalls;
      },
    };
  }

  it("PIC-41: a loomAbort abort forwards to AgentSession.abort() via the one-shot listener", () => {
    const loomAbort = new AbortController();
    // Keep `rec` un-spread so `rec.abortCalls` reads the live getter; object-rest
    // (`...rec`) would snapshot the getter to its value at destructure time.
    const rec = makeSession();
    const { session } = rec;

    attachSubagentAbortForwarding(loomAbort, session);
    expect(rec.abortCalls).toBe(0);

    loomAbort.abort(new Error("cancelled"));
    // PIC-41: cancellation is forwarded solely via the one-shot listener calling
    // `AgentSession.abort()`.
    expect(rec.abortCalls).toBe(1);
  });

  it("PIC-41: an already-aborted loomAbort at attach time calls AgentSession.abort() synchronously", () => {
    const loomAbort = new AbortController();
    loomAbort.abort(new Error("pre-aborted"));
    // Keep `rec` un-spread so `rec.abortCalls` reads the live getter; object-rest
    // (`...rec`) would snapshot the getter to its value at destructure time.
    const rec = makeSession();
    const { session } = rec;

    attachSubagentAbortForwarding(loomAbort, session);

    // PIC-41: the spawn-then-immediate-cancel path — `abort()` fires synchronously
    // before the listener is registered.
    expect(rec.abortCalls).toBe(1);
  });
});

// ===========================================================================
// PIC-42 — session-local completion await (not global pi.on).
// ===========================================================================

describe("V9i-T — PIC-42 session-local subscribe completion", () => {
  function makeSource(): {
    source: SubagentEventSource;
    emit: (event: SubagentSessionEvent) => void;
    subscribeCalls: number;
    unsubscribeCalls: number;
    liveListeners: number;
  } {
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;
    const listeners = new Set<(event: SubagentSessionEvent) => void>();
    const source: SubagentEventSource = {
      subscribe: (listener): (() => void) => {
        subscribeCalls += 1;
        listeners.add(listener);
        return (): void => {
          unsubscribeCalls += 1;
          listeners.delete(listener);
        };
      },
    };
    const emit = (event: SubagentSessionEvent): void => {
      for (const listener of [...listeners]) {
        listener(event);
      }
    };
    return {
      source,
      emit,
      get subscribeCalls() {
        return subscribeCalls;
      },
      get unsubscribeCalls() {
        return unsubscribeCalls;
      },
      get liveListeners() {
        return listeners.size;
      },
    };
  }

  function makeGlobalBus(): { bus: GlobalEventBus; onCalls: number } {
    let onCalls = 0;
    const bus: GlobalEventBus = {
      on: (): void => {
        onCalls += 1;
      },
    };
    return {
      bus,
      get onCalls() {
        return onCalls;
      },
    };
  }

  it("PIC-42: completion is awaited via session.subscribe, never the global pi.on(\"agent_end\", …) event", async () => {
    const src = makeSource();
    const gb = makeGlobalBus();

    const done = awaitTerminalAgentEnd(src.source, gb.bus);
    src.emit(agentEnd([userMessage("q"), assistantMessage("hi", "stop")], false));
    await done;

    // PIC-42: the session-local subscription is used; the global `pi.on` event
    // is never registered.
    expect(src.subscribeCalls).toBe(1);
    expect(gb.onCalls).toBe(0);
  });

  it("PIC-42: willRetry:true events are ignored — resolution comes from the terminal willRetry:false event", async () => {
    const src = makeSource();
    const gb = makeGlobalBus();

    const done = awaitTerminalAgentEnd(src.source, gb.bus);
    // A retry-preceding event MUST NOT resolve the query.
    src.emit(agentEnd([userMessage("q"), assistantMessage("retrying", "stop")], true));
    // The terminal event resolves it.
    src.emit(agentEnd([userMessage("q"), assistantMessage("final", "stop")], false));
    const event = await done;

    expect(event.willRetry).toBe(false);
    const assistant = event.messages.find((m) => m.role === "assistant") as AssistantMessage;
    expect(assistant.content).toEqual([{ type: "text", text: "final" }]);
  });

  it("PIC-42: the runtime unsubscribes before resolving each query", async () => {
    const src = makeSource();
    const gb = makeGlobalBus();

    const done = awaitTerminalAgentEnd(src.source, gb.bus);
    src.emit(agentEnd([userMessage("q"), assistantMessage("final", "stop")], false));
    await done;

    // PIC-42: the subscription is torn down (via the returned unsubscribe) before
    // the query resolves — no listener leaks onto the long-lived session.
    expect(src.unsubscribeCalls).toBe(1);
    expect(src.liveListeners).toBe(0);
  });
});

// ===========================================================================
// PIC-43 — terminal agent_end query-result extraction (short-circuit order).
// ===========================================================================

describe("V9i-T — PIC-43 agent_end query-result extraction", () => {
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
    }
  });

  it("PIC-43: with both short-circuits passed, the trailing turn's assistant text is concatenated into Ok(string)", () => {
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
});

// ===========================================================================
// PIC-9 — session lifecycle (idempotent dispose, teardown finally, budget).
// ===========================================================================

describe("V9i-T — PIC-9 subagent session lifecycle", () => {
  function makeTeardown(disposeImpl?: () => void): {
    teardown: SubagentTeardown;
    disposeCalls: number;
    detachCalls: number;
  } {
    let disposeCalls = 0;
    let detachCalls = 0;
    const idempotentDispose = makeIdempotentDispose({
      dispose: (): void => {
        disposeCalls += 1;
        if (disposeImpl) {
          disposeImpl();
        }
      },
    });
    const teardown: SubagentTeardown = {
      dispose: idempotentDispose,
      detachAbortListener: (): void => {
        detachCalls += 1;
      },
    };
    return {
      teardown,
      get disposeCalls() {
        return disposeCalls;
      },
      get detachCalls() {
        return detachCalls;
      },
    };
  }

  it("PIC-9: dispose() runs in the finally on a normal return, and the abort listener is detached", async () => {
    const h = makeTeardown();
    const value = await runWithSubagentTeardown(
      h.teardown,
      { emitDiagnostic: (): void => {} },
      async () => "ok",
    );

    expect(value).toBe("ok");
    expect(h.disposeCalls).toBe(1);
    expect(h.detachCalls).toBe(1);
  });

  it("PIC-9: dispose() runs in the finally when the body throws, and the original panic is not masked", async () => {
    const h = makeTeardown();

    await expect(
      runWithSubagentTeardown(h.teardown, { emitDiagnostic: (): void => {} }, async () => {
        throw new BodyPanic();
      }),
    ).rejects.toBeInstanceOf(BodyPanic);

    // PIC-9: teardown fires on the panic path too.
    expect(h.disposeCalls).toBe(1);
  });

  it("PIC-9: dispose() is idempotent — a second call is a no-op", () => {
    let disposeCalls = 0;
    const dispose = makeIdempotentDispose({
      dispose: (): void => {
        disposeCalls += 1;
      },
    });

    dispose();
    dispose();

    expect(disposeCalls).toBe(1);
  });

  it("PIC-9: a dispose() throw is logged as advisory loom/runtime/subagent-dispose-failure and does not mask the Ok", async () => {
    const h = makeTeardown(() => {
      throw new DisposeFailure();
    });
    const emitted: { code: string; message: string }[] = [];

    const value = await runWithSubagentTeardown(
      h.teardown,
      {
        emitDiagnostic: (d): void => {
          emitted.push({ code: d.code, message: d.message });
        },
      },
      async () => "ok",
    );

    // PIC-9: the disposal throw never promotes the Ok to an Err — the caller
    // still observes the loom's Ok final value.
    expect(value).toBe("ok");
    // PIC-9: the advisory diagnostic (registry Message column
    // `subagent dispose failed: <dispose error first line>`) is emitted.
    const disposeDiag = emitted.find((e) => e.code === SUBAGENT_DISPOSE_FAILURE_CODE);
    expect(disposeDiag).toBeDefined();
    expect(disposeDiag?.message).toBe("subagent dispose failed: dispose exploded");
  });

  it("PIC-9: SHUTDOWN_AWAIT_CAP_MS covers disposal — the subagent disposal budget equals the shared cap", () => {
    // PIC-9: there is no separate budget for disposal; it is covered by the
    // single `SHUTDOWN_AWAIT_CAP_MS` declaration site.
    expect(SUBAGENT_DISPOSE_BUDGET_MS).toBe(SHUTDOWN_AWAIT_CAP_MS);
  });
});

// ===========================================================================
// PIC-22 — parallel subagent spawn initiation.
// ===========================================================================

describe("V9i-T — PIC-22 parallel subagent spawn initiation", () => {
  it("PIC-22: for N=2 parallel subagent tool calls, all createAgentSession calls complete and each sendUserMessage is entered before any blocked call is released", async () => {
    let created = 0;
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const makeSpawn = (): ParallelSubagentSpawn => ({
      createSession: async () => {
        created += 1;
        return {
          sendUserMessage: async (): Promise<void> => {
            entered += 1;
            // Block until the test explicitly releases every spawn.
            await gate;
          },
        };
      },
    });

    // Do NOT await — the sendUserMessage calls block on `gate`.
    const all = spawnSubagentsInParallel([makeSpawn(), makeSpawn()]);
    await flush();

    // PIC-22: before any blocked call is released, both sessions have been
    // created and both `sendUserMessage` calls have been entered. A sequential
    // runtime would leave the second session uncreated.
    expect(created).toBe(2);
    expect(entered).toBe(2);

    release();
    await all;
  });
});

// ===========================================================================
// FN-5 — subagent caller final-value projection (via the V3d seam).
// ===========================================================================

describe("V9i-T — FN-5 subagent caller final value", () => {
  it("FN-5: the callee's produced final value propagates to the subagent caller on success", () => {
    const result = subagentCallerFinalValue({ kind: "success", value: "callee-final" });

    expect(result.present).toBe(true);
    expect(result.value).toBe("callee-final");
  });

  it("FN-5: no final value flows on failure — the caller observes only the Err", () => {
    const result = subagentCallerFinalValue({
      kind: "fail",
      error: { kind: "transport", message: "boom", http_status: null, provider: "anthropic", retryable: false },
    });

    expect(result.present).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it("FN-5: no final value flows on cancellation — the caller observes only the Err", () => {
    const result = subagentCallerFinalValue({ kind: "cancel" });

    expect(result.present).toBe(false);
    expect(result.value).toBeUndefined();
  });
});
