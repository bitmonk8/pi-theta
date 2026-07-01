// V9c-T — failing tests for the paired `V9c` prompt-mode conversation-drive /
// active-set-gating leaf.
//
// Spec: pi-integration-contract/conversation-drive.md (PIC-2 prompt-mode
// sequential execution, PIC-18 turn-lifecycle event subscription, PIC-53
// untyped-query `Ok(string)` trailing-turn extraction);
// pi-integration-contract/tool-registration-lifetime.md (PIC-17 active-set
// allowlist gating and its §"Acceptance criteria — PIC-17 active-set install
// vector").
//
// These tests red on their own primary assertions while `V9c` is absent,
// because the V9c-T seam stub is deliberately NON-COMPLIANT:
//   - `withActiveSetGating` unions the ambient snapshot into the install vector
//     (PIC-17 "not inherited") and never restores in a `finally` (PIC-17
//     restore; PIC-2 cross-body non-overlap detects the still-open window);
//   - `subscribePromptModeCancelForwarding` registers per-session-marked event
//     names (PIC-18 process-global / no-marker) and never forwards the captured
//     abort into `loomAbort` (PIC-18 cancel-forwarding role);
//   - `extractTrailingTurnText` returns a fixed sentinel (PIC-53).
// No test reds on a compile error, a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import {
  extractTrailingTurnText,
  subscribePromptModeCancelForwarding,
  withActiveSetGating,
  PROMPT_MODE_LIFECYCLE_EVENTS,
  type ActiveInvocationSignals,
  type ActiveToolSet,
  type PromptModeEventApi,
} from "../src/runtime/conversation-drive";

// ---------------------------------------------------------------------------
// Doubles.
// ---------------------------------------------------------------------------

/**
 * A recording double of Pi's active-set surface. `getActiveTools()` returns the
 * current set; `setActiveTools(names)` installs it and logs the exact argument.
 */
function makeRecordingGate(ambient: readonly string[]): {
  gate: ActiveToolSet;
  setCalls: string[][];
} {
  let current = [...ambient];
  const setCalls: string[][] = [];
  const gate: ActiveToolSet = {
    getActiveTools: (): string[] => [...current],
    setActiveTools: (names): void => {
      current = [...names];
      setCalls.push([...names]);
    },
  };
  return { gate, setCalls };
}

/** A recording double of the process-global `pi.on` subscription surface. */
function makeRecordingEventApi(): {
  pi: PromptModeEventApi;
  registrations: { event: string; handler: () => void }[];
  fireAll: () => void;
} {
  const registrations: { event: string; handler: () => void }[] = [];
  const pi: PromptModeEventApi = {
    on: (event, handler): void => {
      registrations.push({ event, handler });
    },
  };
  const fireAll = (): void => {
    for (const { handler } of registrations) {
      handler();
    }
  };
  return { pi, registrations, fireAll };
}

/** A distinct error type so the finally-restore test rejects without a broad catch. */
class QueryFailure extends Error {
  constructor() {
    super("query failed");
    this.name = "QueryFailure";
  }
}

// --- pi-ai Message builders -------------------------------------------------

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

/** An assistant message carrying the given text parts (plus optional thinking / tool-call). */
function assistantMessage(
  parts: readonly (
    | { text: string }
    | { thinking: string }
    | { toolCall: string }
  )[],
): AssistantMessage {
  const content = parts.map((p) => {
    if ("text" in p) {
      return { type: "text" as const, text: p.text };
    }
    if ("thinking" in p) {
      return { type: "thinking" as const, thinking: p.thinking };
    }
    return {
      type: "toolCall" as const,
      id: "tc-1",
      name: p.toolCall,
      arguments: {},
    };
  });
  return {
    role: "assistant",
    content,
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
    stopReason: "stop",
    timestamp: 0,
  };
}

// ===========================================================================
// PIC-17 — active-set allowlist gating: snapshot → install → query → restore.
// ===========================================================================

describe("V9c-T — PIC-17 active-set allowlist gating", () => {
  it("PIC-17: the step-2 install vector is exactly the loom callable set — the ambient snapshot is not inherited", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a", "ambient-b"]);

    await withActiveSetGating(
      gate,
      { loomCallableSetNames: ["loom-x", "loom-y"] },
      async () => "ok",
    );

    // PIC-17: step-2 install is exactly `[...loomCallableSetNames]` (no respond
    // tool on an untyped/free turn) and contains no member of the step-1
    // snapshot — "ambient tools are deliberately not inherited".
    expect(setCalls[0]).toEqual(["loom-x", "loom-y"]);
    expect(setCalls[0]?.some((n) => n === "ambient-a" || n === "ambient-b")).toBe(false);
  });

  it("PIC-17: the forced-respond turn installs exactly [...loomCallableSetNames, respondToolName]", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a"]);

    await withActiveSetGating(
      gate,
      { loomCallableSetNames: ["loom-x"], respondToolName: "__loom_respond_abc" },
      async () => "ok",
    );

    // PIC-17 acceptance criterion (b): the respond tool is appended last.
    expect(setCalls[0]).toEqual(["loom-x", "__loom_respond_abc"]);
    expect(setCalls[0]?.includes("ambient-a")).toBe(false);
  });

  it("PIC-17: an empty callable set on a typed forced-respond turn installs exactly [respondToolName]", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a"]);

    await withActiveSetGating(
      gate,
      { loomCallableSetNames: [], respondToolName: "__loom_respond_abc" },
      async () => "ok",
    );

    // PIC-17 acceptance criterion (b), empty-set case.
    expect(setCalls[0]).toEqual(["__loom_respond_abc"]);
  });

  it("PIC-17: the snapshot is restored in a finally even when the query throws", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a", "ambient-b"]);

    await expect(
      withActiveSetGating(gate, { loomCallableSetNames: ["loom-x"] }, async () => {
        throw new QueryFailure();
      }),
    ).rejects.toBeInstanceOf(QueryFailure);

    // PIC-17 step-4: the `finally` restores the exact step-1 snapshot even on a
    // query exception — the last active-set call returns the ambient snapshot.
    expect(setCalls.at(-1)).toEqual(["ambient-a", "ambient-b"]);
  });
});

// ===========================================================================
// PIC-2 — prompt-mode sequential execution: cross-body window non-overlap.
// ===========================================================================

describe("V9c-T — PIC-2 prompt-mode sequential execution (cross-body non-overlap)", () => {
  it("PIC-2: a nested prompt→prompt invoke opens its active-set window only after the parent body's window is restored — at most one window open at a time", async () => {
    const ambient = ["ambient-a"];
    const { gate, setCalls } = makeRecordingGate(ambient);

    // Parent body: run a query (opens + closes its own window), then — between
    // queries — invoke a prompt-mode child that runs its own query. The child's
    // window must open only after the parent's is restored.
    await withActiveSetGating(gate, { loomCallableSetNames: ["parent-tool"] }, async () => {
      /* parent's query turn — the body itself issues no active-set call */
    });
    // ...parent body resumes and invokes the child (a distinct prompt-mode body)...
    await withActiveSetGating(gate, { loomCallableSetNames: ["child-tool"] }, async () => {
      /* child's query turn */
    });

    // PIC-2: classify each active-set install as OPEN (not the ambient set) or
    // CLOSE (a restore back to the ambient snapshot); the running open-window
    // depth must never exceed 1 — no two prompt-mode bodies hold an open window
    // simultaneously.
    const isAmbient = (names: string[]): boolean =>
      names.length === ambient.length && names.every((n, i) => n === ambient[i]);
    let depth = 0;
    let maxDepth = 0;
    for (const call of setCalls) {
      if (isAmbient(call)) {
        depth -= 1;
      } else {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    expect(maxDepth).toBe(1);
  });
});

// ===========================================================================
// PIC-18 — prompt-mode turn-lifecycle event subscription (cancel-forward only).
// ===========================================================================

describe("V9c-T — PIC-18 prompt-mode turn-lifecycle event subscription", () => {
  it("PIC-18: the subscription is process-global — exactly the five lifecycle events, each under its bare name with no per-session marker", () => {
    const { pi, registrations } = makeRecordingEventApi();

    subscribePromptModeCancelForwarding(pi, () => undefined);

    // PIC-18: exactly the five turn-lifecycle events, each registered under its
    // bare, process-global name (no per-session origin marker appended).
    const events = registrations.map((r) => r.event).sort();
    expect(events).toEqual([...PROMPT_MODE_LIFECYCLE_EVENTS].sort());
  });

  it("PIC-18: the handlers forward the captured abort into loomAbort (cancel-forward only, never completion)", () => {
    const { pi, fireAll } = makeRecordingEventApi();

    const captured = new AbortController();
    const loomAbort = new AbortController();
    const invocation: ActiveInvocationSignals = {
      capturedSignal: captured.signal,
      loomAbort,
    };
    subscribePromptModeCancelForwarding(pi, () => invocation);

    // A cross-fire while the captured signal is NOT aborted only re-checks it —
    // it must not spuriously abort (nor resolve completion).
    fireAll();
    expect(loomAbort.signal.aborted).toBe(false);

    // PIC-18 primary assertion: once the captured `ctx.signal` is aborted, a
    // lifecycle event forwards that abort into the V17a `loomAbort` controller.
    const reason = new Error("cancelled by ctx.signal");
    captured.abort(reason);
    fireAll();
    expect(loomAbort.signal.aborted).toBe(true);
    expect(loomAbort.signal.reason).toBe(reason);
  });
});

// ===========================================================================
// PIC-53 — untyped-query `Ok(string)` trailing-turn extraction.
// ===========================================================================

describe("V9c-T — PIC-53 untyped-query trailing-turn Ok(string) extraction", () => {
  it("PIC-53: a single-assistant trailing turn yields that assistant message's text", () => {
    const messages: Message[] = [
      userMessage("do the thing"),
      assistantMessage([{ text: "hello world" }]),
    ];
    expect(extractTrailingTurnText(messages)).toBe("hello world");
  });

  it("PIC-53: successive assistant messages in the final turn join with a single \\n", () => {
    const messages: Message[] = [
      userMessage("do the thing"),
      assistantMessage([{ text: "first" }]),
      assistantMessage([{ text: "second" }]),
    ];
    expect(extractTrailingTurnText(messages)).toBe("first\nsecond");
  });

  it("PIC-53: the trailing turn excludes earlier turns on the long-lived user session", () => {
    const messages: Message[] = [
      userMessage("earlier invocation"),
      assistantMessage([{ text: "earlier answer" }]),
      userMessage("this loom-issued turn"),
      assistantMessage([{ text: "trailing answer" }]),
    ];
    // PIC-53: only the trailing turn (after the last `user` message) contributes.
    expect(extractTrailingTurnText(messages)).toBe("trailing answer");
  });

  it("PIC-53: the provider-internal thinking array and toolCalls are omitted", () => {
    const messages: Message[] = [
      userMessage("do the thing"),
      assistantMessage([
        { thinking: "internal reasoning" },
        { text: "visible answer" },
        { toolCall: "search" },
      ]),
    ];
    expect(extractTrailingTurnText(messages)).toBe("visible answer");
  });

  it("PIC-53: a final turn that produced no assistant text (a pure tool-use turn) yields the empty string", () => {
    const messages: Message[] = [
      userMessage("do the thing"),
      assistantMessage([{ toolCall: "search" }]),
    ];
    expect(extractTrailingTurnText(messages)).toBe("");
  });
});
