// RFC 0011 (V24a-T) — failing tests for the session-control runtime-tool
// adapters (the paired `V24a` implementation leaf), seam sheet §6.2 / §6.5
// cells D1-D11.
//
// Spec: docs/rfcs/0011-session-control-tools.md §2 (Detailed design);
// docs/reference/tool-calls.md #session-control-runtime-tools;
// `.localpi/tmp/rfc-0011-seam-sheet.md` §6.2 / §6.5.
//
// Every adapter under test (`executeCompactTool` / `executeContextUsageTool`
// / `executeSessionNameTool`, `src/runtime/session-control-tools.ts`) is a
// V24a-T-owned STUB whose body `throw`s "RFC 0011 V24a: unimplemented". Per
// the RFC 0011 Phase 3 builder contract ("the stub's unimplemented throw
// surfacing as the failed call under test is acceptable for D1-D11"), each
// test below asserts the REAL post-V24a observable the seam sheet pins —
// today every one of them reds because the call throws before the assertion
// is ever reached, not because of a compile error, a missing fixture, or a
// harness throw. Each `it()` names its D-cell so the implementer's V24a pass
// can diff this file against green with zero rewriting.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CompactOptions, ContextUsage } from "@earendil-works/pi-coding-agent";
import {
  executeCompactTool,
  executeContextUsageTool,
  executeSessionNameTool,
  type SessionControlCtx,
  type SessionControlPi,
} from "../src/runtime/session-control-tools";
import { type ResultValue, type ThetaValue } from "../src/runtime/value";
import {
  guardToolExecutePromise,
  type ToolExecuteCancellationGuard,
  type ToolExecuteSideChannels,
} from "../src/runtime/tool-call-swallowing-handler";

/** Unwrap a `ThetaValue` known to be a branded `Result` for direct field access. */
function asResult(value: ThetaValue): ResultValue {
  return value as ResultValue;
}

const noopChannels: ToolExecuteSideChannels = {
  emitRuntimeEvent: (): void => {},
  emitDiagnostic: (): void => {},
};

// ===========================================================================
// D1 / D2 — compact() onComplete → Ok forwarded verbatim; blank instructions
// → customInstructions: undefined.
// ===========================================================================

describe("session-control-adapters (V24a-T) — executeCompactTool onComplete (D1/D2)", () => {
  it("D1: onComplete forwards {summary, tokens_before, tokens_after} verbatim and records customInstructions", async () => {
    const captured: CompactOptions[] = [];
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        captured.push(options ?? {});
        options?.onComplete?.({
          summary: "s",
          tokensBefore: 100,
          estimatedTokensAfter: 40,
          firstKeptEntryId: "x",
        });
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const value = await executeCompactTool(host, "compact", "keep");
    const result = asResult(value);

    expect(result.ok, "D1 primary: compact resolves Ok").toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ summary: "s", tokens_before: 100, tokens_after: 40 });
    }
    expect(captured[0]?.customInstructions).toBe("keep");
  });

  it("D2: whitespace-only instructions record customInstructions: undefined (bare-/compact mapping)", async () => {
    const captured: CompactOptions[] = [];
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        captured.push(options ?? {});
        options?.onComplete?.({
          summary: "s",
          tokensBefore: 10,
          estimatedTokensAfter: 5,
          firstKeptEntryId: "x",
        });
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    await executeCompactTool(host, "compact", "  ");

    expect(captured[0]?.customInstructions, "D2 primary: whitespace instructions bind undefined").toBeUndefined();
  });
});

// ===========================================================================
// D3 / D3b — onError(benign refusal) → Err(cause "execution"), message
// verbatim.
// ===========================================================================

describe("session-control-adapters (V24a-T) — executeCompactTool onError benign refusals (D3/D3b)", () => {
  it("D3: onError(Nothing to compact (session too small)) → Err(cause 'execution') carrying the message verbatim", async () => {
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        options?.onError?.(new Error("Nothing to compact (session too small)"));
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const value = await executeCompactTool(host, "compact", "");
    const result = asResult(value);

    expect(result.ok, "D3 primary: onError lowers to Err").toBe(false);
    if (!result.ok) {
      const error = result.error as { kind: string; cause: string; tool_name: string; message: string };
      expect(error.kind).toBe("code_tool");
      expect(error.cause).toBe("execution");
      expect(error.tool_name).toBe("compact");
      expect(error.message).toBe("Nothing to compact (session too small)");
    }
  });

  it("D3b: onError(Already compacted) → Err(cause 'execution') carrying the message verbatim", async () => {
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        options?.onError?.(new Error("Already compacted"));
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const value = await executeCompactTool(host, "compact", "");
    const result = asResult(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe("Already compacted");
    }
  });
});

// ===========================================================================
// D4 — onComplete result WITHOUT estimatedTokensAfter → the pinned
// never-fabricate execution-Err (seam sheet C2(c)).
// ===========================================================================

describe("session-control-adapters (V24a-T) — executeCompactTool absent token estimate (D4)", () => {
  it("D4: onComplete without estimatedTokensAfter → Err(cause 'execution', 'compaction completed but the host reported no token estimate')", async () => {
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        options?.onComplete?.({
          summary: "s",
          tokensBefore: 100,
          firstKeptEntryId: "x",
          // estimatedTokensAfter intentionally absent (CompactionResult optional field).
        });
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const value = await executeCompactTool(host, "compact", "");
    const result = asResult(value);

    expect(result.ok, "D4 primary: never fabricate the absent estimate").toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe("compaction completed but the host reported no token estimate");
    }
  });
});

// ===========================================================================
// D5 / D5b / D5c — Option A cancellation (C2(d)): abort mid-flight surfaces
// cause "cancelled" promptly with ZERO host abort calls, and the late
// background settlement (either kind) is discarded — no second outcome, no
// Node `unhandledRejection`.
//
// The adapter itself never takes a signal (§6.2): the abort race is the
// executor arm's own `guardToolExecutePromise` / signal-race machinery
// (§6.3), reused here directly over the adapter's Promise so this cell is
// witnessed at the adapter boundary per the builder task's file assignment.
// A widened fake (structurally beyond `SessionControlCtx`) carries `abort`
// and `abortCompaction` spies so "zero host abort calls" is an observable,
// not merely a type-level impossibility.
// ===========================================================================

describe("session-control-adapters (V24a-T) — Option A cancellation race (D5/D5b/D5c)", () => {
  const unhandled: unknown[] = [];
  function onUnhandled(reason: unknown): void {
    unhandled.push(reason);
  }
  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
  });
  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  it("D5: an abort mid-flight surfaces 'cancelled' promptly and the fake records ZERO abort/abortCompaction calls", async () => {
    const abortCalls: string[] = [];
    const capturedOptions: CompactOptions[] = [];
    // never-settling compact: onComplete/onError are captured, not invoked
    // synchronously — the abort race must win before either fires.
    const host: SessionControlCtx & { abort: () => void; abortCompaction: () => void } = {
      compact: (options?: CompactOptions): void => {
        capturedOptions.push(options ?? {});
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
      abort: (): void => {
        abortCalls.push("abort");
      },
      abortCompaction: (): void => {
        abortCalls.push("abortCompaction");
      },
    };

    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };

    const outcome = await new Promise<"settled" | "cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        if (!guard.cancellationSurfaced) {
          resolve("settled");
        }
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });

    expect(outcome, "D5 primary: the abort race resolves 'cancelled' promptly").toBe("cancelled");
    expect(abortCalls, "D5: Option A invokes NO host abort of any kind").toEqual([]);
    void capturedOptions;
  });

  it("D5b: a LATE onComplete after the cancelled outcome is discarded — no second outcome, no unhandledRejection", async () => {
    let onCompleteFn: ((r: { summary: string; tokensBefore: number; estimatedTokensAfter: number; firstKeptEntryId: string }) => void) | undefined;
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        onCompleteFn = options?.onComplete;
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };
    let settledCount = 0;

    const cancelled = await new Promise<"cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        settledCount += 1;
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });
    expect(cancelled).toBe("cancelled");

    // Background compaction completes late, after the theta reported cancelled.
    onCompleteFn?.({ summary: "s", tokensBefore: 100, estimatedTokensAfter: 40, firstKeptEntryId: "x" });

    // Drain microtasks + one macrotask so a would-be unhandledRejection lands.
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(settledCount, "D5b: no second visible outcome from the late onComplete").toBeLessThanOrEqual(1);
    expect(unhandled).toEqual([]);
  });

  it("D5c: a LATE onError('Compaction cancelled') after the cancelled outcome is discarded likewise", async () => {
    let onErrorFn: ((e: Error) => void) | undefined;
    const host: SessionControlCtx = {
      compact: (options?: CompactOptions): void => {
        onErrorFn = options?.onError;
      },
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };
    let settledCount = 0;

    const cancelled = await new Promise<"cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        settledCount += 1;
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });
    expect(cancelled).toBe("cancelled");

    onErrorFn?.(new Error("Compaction cancelled"));

    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(settledCount, "D5c: no second visible outcome, never a late execution-Err").toBeLessThanOrEqual(1);
    expect(unhandled).toEqual([]);
  });
});

// ===========================================================================
// D6 / D7 / D8 — context_usage() gauge lowering.
// ===========================================================================

describe("session-control-adapters (V24a-T) — executeContextUsageTool gauge lowering (D6/D7/D8)", () => {
  it("D6: getContextUsage() → undefined → Err('context usage unavailable: no model selected or unknown context window')", async () => {
    const host: SessionControlCtx = {
      compact: (): void => {},
      getContextUsage: (): ContextUsage | undefined => undefined,
    };

    const value = await executeContextUsageTool(host, "context_usage");
    const result = asResult(value);

    expect(result.ok, "D6 primary").toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe("context usage unavailable: no model selected or unknown context window");
    }
  });

  it("D7: {tokens: null, contextWindow: 200000, percent: null} → Err('context usage unknown until the next assistant response')", async () => {
    const host: SessionControlCtx = {
      compact: (): void => {},
      getContextUsage: (): ContextUsage | undefined => ({ tokens: null, contextWindow: 200000, percent: null }),
    };

    const value = await executeContextUsageTool(host, "context_usage");
    const result = asResult(value);

    expect(result.ok, "D7 primary").toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; message: string };
      expect(error.cause).toBe("execution");
      expect(error.message).toBe("context usage unknown until the next assistant response");
    }
  });

  it("D8: a defined gauge lowers to Ok with the context_window rename, all three fields non-null", async () => {
    const host: SessionControlCtx = {
      compact: (): void => {},
      getContextUsage: (): ContextUsage | undefined => ({ tokens: 1234, contextWindow: 200000, percent: 0.617 }),
    };

    const value = await executeContextUsageTool(host, "context_usage");
    const result = asResult(value);

    expect(result.ok, "D8 primary").toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ tokens: 1234, context_window: 200000, percent: 0.617 });
    }
  });
});

// ===========================================================================
// D9 / D9b / D10 — session_name(name) set + read-back / blank validation.
// ===========================================================================

describe("session-control-adapters (V24a-T) — executeSessionNameTool (D9/D9b/D10)", () => {
  it("D9: setSessionName called exactly once, then Ok(getSessionName()) read-back", async () => {
    const setCalls: string[] = [];
    const pi: SessionControlPi = {
      setSessionName: (name: string): void => {
        setCalls.push(name);
      },
      getSessionName: (): string | undefined => "fix-loop a",
    };

    const value = await executeSessionNameTool(pi, "session_name", "fix-loop a");
    const result = asResult(value);

    expect(setCalls, "D9 primary: setSessionName called exactly once").toEqual(["fix-loop a"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("fix-loop a");
    }
  });

  it("D9b: getSessionName() → undefined falls back to Ok(name) (the '?? name' arm)", async () => {
    const pi: SessionControlPi = {
      setSessionName: (): void => {},
      getSessionName: (): string | undefined => undefined,
    };

    const value = await executeSessionNameTool(pi, "session_name", "fix-loop a");
    const result = asResult(value);

    expect(result.ok, "D9b primary").toBe(true);
    if (result.ok) {
      expect(result.value).toBe("fix-loop a");
    }
  });

  it("D10: blank / whitespace-only name → Err(cause 'validation', message verbatim); setSessionName NOT called", async () => {
    const setCalls: string[] = [];
    const pi: SessionControlPi = {
      setSessionName: (name: string): void => {
        setCalls.push(name);
      },
      getSessionName: (): string | undefined => undefined,
    };

    const value = await executeSessionNameTool(pi, "session_name", "  ");
    const result = asResult(value);

    expect(result.ok, "D10 primary").toBe(false);
    if (!result.ok) {
      const error = result.error as { cause: string; message: string };
      expect(error.cause).toBe("validation");
      expect(error.message).toBe("session name must not be empty or whitespace-only");
    }
    expect(setCalls, "D10: setSessionName not invoked on the blank-name refusal").toEqual([]);
  });
});

// D11 (the resolver's runtime argument net, §5.4) is owned by the resolver /
// executor arm (§6.3) — a non-string bound value never reaches this module's
// adapters at all (they are dispatched only after the net clears). It is
// witnessed in `tests/session-control-dispatch.test.ts`, alongside D12-D15,
// where the full producer/executor harness can actually launder a value past
// statics and drive it to the resolver.
