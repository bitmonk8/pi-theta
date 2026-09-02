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
//   - the install-vector cells exercise `computeActiveSetInstall` directly,
//     and the gating-window cells exercise `withActiveSetGate`
//     (tool-registration.ts) — see the bug-0372 retarget note below for how
//     each still asserts its ORIGINAL PIC-17/PIC-2 property;
//   - `subscribePromptModeCancelForwarding` registers per-session-marked event
//     names (PIC-18 process-global / no-marker) and never forwards the captured
//     abort into `thetaAbort` (PIC-18 cancel-forwarding role);
//   - `extractTrailingTurnText` returns a fixed sentinel (PIC-53).
// No test reds on a compile error, a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import {
  extractTrailingTurnText,
  subscribePromptModeCancelForwarding,
  computeActiveSetInstall,
  PROMPT_MODE_LIFECYCLE_EVENTS,
  type ActiveInvocationSignals,
  type PromptModeEventApi,
} from "../src/runtime/conversation-drive";
import { withActiveSetGate, type ActiveSetGateDeps, type ActiveSetPi } from "../src/runtime/tool-registration";

// Bug 0372 §Fix: `withActiveSetGating` (the bare gating helper this file used
// to import) was deleted — the shipped windows now restore through the
// compliant `withActiveSetGate` (tool-registration.ts), the ONE gating-window
// implementation. The gating-window cells below retarget onto it with a
// precomputed `installVector` (via `computeActiveSetInstall`) and no-op
// PIC-8/PIC-19 deps, keeping each cell's ORIGINAL snapshot/install/restore
// property — `withActiveSetGate` still satisfies PIC-17 (install vector,
// non-inheritance, finally-restore) and PIC-2 (cross-body non-overlap). The
// install-vector-COMPUTATION cells retarget onto `computeActiveSetInstall`
// directly, asserting the same install-vector property.

/** No-op PIC-8/PIC-19 deps for a gating-window cell exercising a healthy gate (no restore/install throw). */
function noopGateDeps(): Pick<
  ActiveSetGateDeps,
  "emitDiagnostic" | "emitSystemNote" | "routeInternalError"
> {
  return {
    emitDiagnostic: (): void => {},
    emitSystemNote: (): void => {},
    routeInternalError: (): void => {},
  };
}

// ---------------------------------------------------------------------------
// Doubles.
// ---------------------------------------------------------------------------

/**
 * A recording double of Pi's active-set surface. `getActiveTools()` returns the
 * current set; `setActiveTools(names)` installs it and logs the exact argument.
 */
function makeRecordingGate(ambient: readonly string[]): {
  gate: ActiveSetPi;
  setCalls: string[][];
} {
  let current = [...ambient];
  const setCalls: string[][] = [];
  const gate: ActiveSetPi = {
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
  it("PIC-17: the step-2 install vector is exactly the theta callable set — the ambient snapshot is not inherited", () => {
    // Retargeted (bug 0372 §Fix): asserts the same install-vector property
    // directly against `computeActiveSetInstall`, the function every gating
    // caller now threads into `withActiveSetGate`.
    const installVector = computeActiveSetInstall({ thetaCallableSetNames: ["theta-x", "theta-y"] });

    // PIC-17: exactly `[...thetaCallableSetNames]` (no respond tool on an
    // untyped/free turn) and contains no member of the step-1 snapshot —
    // "ambient tools are deliberately not inherited".
    expect(installVector).toEqual(["theta-x", "theta-y"]);
    expect(installVector.some((n) => n === "ambient-a" || n === "ambient-b")).toBe(false);
  });

  it("PIC-17: the forced-respond turn installs exactly [...thetaCallableSetNames, respondToolName]", () => {
    const installVector = computeActiveSetInstall({
      thetaCallableSetNames: ["theta-x"],
      respondToolName: "__theta_respond_abc",
    });

    // PIC-17 acceptance criterion (b): the respond tool is appended last.
    expect(installVector).toEqual(["theta-x", "__theta_respond_abc"]);
    expect(installVector.includes("ambient-a")).toBe(false);
  });

  it("PIC-17: an empty callable set on a typed forced-respond turn installs exactly [respondToolName]", () => {
    const installVector = computeActiveSetInstall({
      thetaCallableSetNames: [],
      respondToolName: "__theta_respond_abc",
    });

    // PIC-17 acceptance criterion (b), empty-set case.
    expect(installVector).toEqual(["__theta_respond_abc"]);
  });

  it("PIC-17: the snapshot is restored in a finally even when the query throws", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a", "ambient-b"]);
    const installVector = computeActiveSetInstall({ thetaCallableSetNames: ["theta-x"] });

    // Retargeted (bug 0372 §Fix): `withActiveSetGate` still satisfies the
    // PIC-8(d) property this cell pins — a restore failure never masks the
    // inner error, and here (a healthy gate) the restore succeeds so the
    // ORIGINAL query throw propagates unmasked, exactly as HEAD.
    await expect(
      withActiveSetGate(
        { pi: gate, thetaName: "probe", installVector, ...noopGateDeps() },
        async () => {
          throw new QueryFailure();
        },
      ),
    ).rejects.toBeInstanceOf(QueryFailure);

    // PIC-17 step-4: the restore recovers the exact step-1 snapshot even on a
    // query exception — the last active-set call returns the ambient snapshot.
    expect(setCalls.at(-1)).toEqual(["ambient-a", "ambient-b"]);
  });
});

// ===========================================================================
// PIC-17 × bug 0001 / PIC-64 — an ADMITTED prompt-mode EXTENSION tool is in the
// query-window install vector because it is IN THE CALLABLE SET, and the
// ambient-snapshot non-union rule is NOT weakened by the fix.
// Spec: tool-registration-lifetime.md PIC-17 ("An **extension-supplied** Pi
// tool admitted into the callable set … is a member of thetaCallableSetNames,
// so its name is in this install vector … It reaches the model because it is
// *in the callable set*, not because the ambient snapshot was inherited; the
// non-union rule above is unchanged.").
// ===========================================================================

describe("PIC-17 — prompt-mode extension tool in the query-window active set (bug 0001)", () => {
  it("PIC-17: the install vector CONTAINS the admitted extension tool name and is EXACTLY the callable set", async () => {
    const { gate, setCalls } = makeRecordingGate(["ambient-a", "ambient-b"]);
    // An admitted extension tool (`finding_store`) is a member of the theta's
    // callable-set names on the same footing as the built-in.
    const installVector = computeActiveSetInstall({ thetaCallableSetNames: ["read", "finding_store"] });

    let activeDuringQuery: string[] = [];
    // Retargeted (bug 0372 §Fix): `withActiveSetGate` with a precomputed
    // install vector, keeping the ORIGINAL property — the admitted extension
    // tool is active during the query window because it is in the callable set.
    await withActiveSetGate(
      { pi: gate, thetaName: "probe", installVector, ...noopGateDeps() },
      async () => {
        activeDuringQuery = gate.getActiveTools();
        return "ok";
      },
    );

    // The extension tool reaches the model during the query window…
    expect(activeDuringQuery).toContain("finding_store");
    // …because the install vector is exactly the callable set — nothing more.
    expect(setCalls[0]).toEqual(["read", "finding_store"]);
  });

  it("PIC-17: the ambient session snapshot is STILL not unioned in — the fix must not weaken the non-inheritance rule", async () => {
    // The ambient set carries an extension tool the theta did NOT declare
    // (`projection`): it must not leak into the install vector.
    const { gate, setCalls } = makeRecordingGate(["projection", "ambient-b"]);
    const installVector = computeActiveSetInstall({ thetaCallableSetNames: ["finding_store"] });

    await withActiveSetGate(
      { pi: gate, thetaName: "probe", installVector, ...noopGateDeps() },
      async () => "ok",
    );

    // Install vector is exactly the callable set — no ambient extras.
    expect(setCalls[0]).toEqual(["finding_store"]);
    expect(setCalls[0]).not.toContain("projection");
    expect(setCalls[0]).not.toContain("ambient-b");
    // The step-4 restore returns the exact ambient snapshot.
    expect(setCalls.at(-1)).toEqual(["projection", "ambient-b"]);
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
    // window must open only after the parent's is restored. Retargeted (bug
    // 0372 §Fix) onto `withActiveSetGate` — the cross-body non-overlap property
    // this cell pins is unchanged by the fix.
    await withActiveSetGate(
      {
        pi: gate,
        thetaName: "parent",
        installVector: computeActiveSetInstall({ thetaCallableSetNames: ["parent-tool"] }),
        ...noopGateDeps(),
      },
      async () => {
        /* parent's query turn — the body itself issues no active-set call */
      },
    );
    // ...parent body resumes and invokes the child (a distinct prompt-mode body)...
    await withActiveSetGate(
      {
        pi: gate,
        thetaName: "child",
        installVector: computeActiveSetInstall({ thetaCallableSetNames: ["child-tool"] }),
        ...noopGateDeps(),
      },
      async () => {
        /* child's query turn */
      },
    );

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

  it("PIC-18: the handlers forward the captured abort into thetaAbort (cancel-forward only, never completion)", () => {
    const { pi, fireAll } = makeRecordingEventApi();

    const captured = new AbortController();
    const thetaAbort = new AbortController();
    const invocation: ActiveInvocationSignals = {
      capturedSignal: captured.signal,
      thetaAbort,
    };
    subscribePromptModeCancelForwarding(pi, () => invocation);

    // A cross-fire while the captured signal is NOT aborted only re-checks it —
    // it must not spuriously abort (nor resolve completion).
    fireAll();
    expect(thetaAbort.signal.aborted).toBe(false);

    // PIC-18 primary assertion: once the captured `ctx.signal` is aborted, a
    // lifecycle event forwards that abort into the V17a `thetaAbort` controller.
    const reason = new Error("cancelled by ctx.signal");
    captured.abort(reason);
    fireAll();
    expect(thetaAbort.signal.aborted).toBe(true);
    expect(thetaAbort.signal.reason).toBe(reason);
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
      userMessage("this theta-issued turn"),
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

  // QRY-1 (query/query-forms.md#qry-1): the untyped `@`...`` form's `Ok` value
  // is "the assistant's text response as a string" (return type
  // Result<string, QueryError>). The trailing-turn extractor is the runtime
  // surface that produces that `Ok(string)` payload, so this is the same shipped
  // behaviour PIC-53 exercises, asserted against the QRY-1 query-forms
  // obligation the untyped form states.
  it("QRY-1: the untyped-query Ok(string) value is the assistant's text response as a string", () => {
    const messages: Message[] = [
      userMessage("Critique this code"),
      assistantMessage([{ text: "the assistant's critique" }]),
    ];
    const okValue: string = extractTrailingTurnText(messages);
    // QRY-1: the Ok value is a `string` carrying the assistant's text response.
    expect(typeof okValue).toBe("string");
    expect(okValue).toBe("the assistant's critique");
  });
});
