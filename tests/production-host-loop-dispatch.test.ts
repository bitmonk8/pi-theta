// RFC-0006 (PIC-64 rung 2) — production host-loop dispatch collaborators.
//
// Drives `createProductionHostLoopDispatch` over a FAKE host that simulates the
// child's host agent loop (the real loop is live-only): a `sendUserMessage`
// schedules a fabricated turn that invokes the theta-controlled provider's
// two-state `streamSimple`, executes the authored `tool_use` against a fake tool
// executor, appends the toolResult to the session transcript, then fires
// `agent_settled`. The assertions pin the blueprint contract:
//   - the `agent_settled` barrier is ARMED before `sendUserMessage` (the
//     dispatch does not resolve until settled fires — `waitForIdle` alone is
//     insufficient, prototype CONSTRAINT 1);
//   - the code-supplied arguments are authored VERBATIM (zero model tokens);
//   - the appended toolResult (incl. `isError`) is read back to code;
//   - the session model + active set are snapshot/restored on success AND on
//     throw / abort (the bridge model is never left installed);
//   - the provider is unregistered and its stream fn deactivated afterwards.
//
// Spec: pi-integration-contract/subagent.md (PIC-64), .prototype-hld blueprint.

import { describe, expect, it } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  BRIDGE_MODEL_ID,
  createProductionHostLoopDispatch,
  probeGetToolDefinitionSurface,
  probeHostLoopSurfaces,
  REQUEST_MARKER,
  type HostLoopCtx,
  type HostLoopPi,
} from "../src/extension/production-host-loop-dispatch";
import {
  resolveDispatchLadder,
  type EncodedToolRequest,
  type HostToolResult,
} from "../src/runtime/host-loop-dispatch";
// The fabricated-turn host-loop simulation is shared with the parent-leg e2e
// suite (prompt-mode-extension-tool-reach-e2e.test.ts) — the PIC-64 wiring is
// identical in both legs, so one fake serves both. This suite drives the CHILD
// leg's seam directly over `host()`.
import {
  fakeModel,
  FakeHostLoopHost as FakeChildHost,
  testClock,
  type FakeToolResult,
} from "./helpers/fake-host-loop-host";

const OK_EXECUTOR = (name: string, args: unknown): FakeToolResult => ({
  content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
  isError: false,
});

describe("PIC-64 rung 2 — production host-loop dispatch collaborators", () => {
  it("registers the provider, snapshots/switches the model, sends AFTER arming settled, reads the toolResult back, then unregisters + restores", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    const request: EncodedToolRequest = { toolName: "finding_store", args: { op: "write", id: 7 } };

    const result = await dispatch(request, new AbortController().signal);

    // Read-back carries the tool's return value verbatim.
    const text = result.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    expect(text).toBe(`RAN:finding_store:${JSON.stringify({ op: "write", id: 7 })}`);
    expect(result.isError).toBe(false);

    // The code-supplied args were authored VERBATIM into the `tool_use`.
    expect(host.authoredArgs).toEqual({ op: "write", id: 7 });

    // Ordering (the blueprint): snapshot active set → install [tool] → switch to
    // the bridge → SEND (settled armed before this) → settled → restore active
    // set → restore model. `send` MUST come after `setModel:host-loop-bridge`.
    const op = host.op;
    const iSetActive = op.indexOf("setActiveTools:[finding_store]");
    const iSetBridge = op.indexOf(`setModel:${BRIDGE_MODEL_ID}`);
    const iSend = op.indexOf("send");
    const iSettled = op.indexOf("settled");
    const iRestoreModel = op.lastIndexOf("setModel:real-model");
    expect(iSetActive).toBeGreaterThanOrEqual(0);
    expect(iSetActive).toBeLessThan(iSetBridge);
    expect(iSetBridge).toBeLessThan(iSend);
    expect(iSend).toBeLessThan(iSettled);
    expect(iSettled).toBeLessThan(iRestoreModel);

    // The bridge model is NOT left installed, and the ambient active set is
    // restored to its exact pre-dispatch snapshot.
    expect(op[op.length - 1]).toBe("setModel:real-model");
    expect(host.pi.getActiveTools()).toEqual(["ambient-a", "ambient-b"]);
  });

  it("the send happens while the bridge model + the [toolName] active set are installed (the authored call can execute)", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "my_tool", args: { q: 1 } }, new AbortController().signal);
    expect(host.sends).toHaveLength(1);
    expect(host.sends[0]!.modelAtSend).toBe(BRIDGE_MODEL_ID);
    expect(host.sends[0]!.activeAtSend).toEqual(["my_tool"]);
  });

  it("does NOT resolve until agent_settled fires (waitForIdle alone is insufficient — prototype CONSTRAINT 1)", async () => {
    // A host that NEVER fires agent_settled: the dispatch must stay pending.
    const host = new FakeChildHost(OK_EXECUTOR, { fireSettled: false });
    const dispatch = createProductionHostLoopDispatch(host.host());
    let settled = false;
    const p = dispatch({ toolName: "t", args: {} }, new AbortController().signal).then((r) => {
      settled = true;
      return r;
    });
    // Give the fabricated turn ample microtasks to run; without agent_settled the
    // dispatch cannot resolve.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    // The turn ran (the tool executed + appended a result) — it is ONLY the
    // settle barrier that gates resolution.
    expect(host.entries.some((e) => e.message?.["role"] === "toolResult")).toBe(true);
    void p; // leave pending; the test asserts non-resolution
  });

  it("returns an isError host tool result to code (not fabricated away)", async () => {
    const host = new FakeChildHost(() => ({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    }));
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "t", args: {} }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content.map((b) => b.text).join("")).toBe("boom");
  });

  it("entries-scoping: a pre-existing toolResult entry is not read back as the new result", async () => {
    // The executor appends a result for the dispatched tool. A stale toolResult
    // for another tool is pre-seeded to prove read-back scopes to entries
    // appended by THIS turn + matching name (never the stale OTHER one).
    const host = new FakeChildHost(OK_EXECUTOR);
    host.entries.push({
      type: "message",
      message: { role: "toolResult", toolName: "OTHER", content: [{ type: "text", text: "stale" }], isError: false },
    });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "finding_store", args: { op: "read" } }, new AbortController().signal);
    // The turn DID run finding_store (executor is name-agnostic), so this
    // resolves ok — assert the RIGHT result, not the stale OTHER one.
    expect(result.content.map((b) => b.text).join("")).toContain("RAN:finding_store");
  });

  it("fail-closed: an isError no-result when the fabricated turn appends a toolResult for a DIFFERENT tool name only", async () => {
    // The host loop ran (and appended a toolResult for) a DIFFERENT tool than the
    // dispatched one — read-back finds no match for the dispatched name → an
    // isError no-result carrying the exact "produced no tool result" message,
    // never a fabricated ok.
    const host = new FakeChildHost(OK_EXECUTOR, { resultToolName: "some_other_tool" });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const result = await dispatch({ toolName: "finding_store", args: { op: "read" } }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content.map((b) => b.text).join("")).toBe(
      "host-loop dispatch produced no tool result for 'finding_store'",
    );
  });

  it("restores the model even when the fabricated turn is aborted mid-flight (bridge never left installed)", async () => {
    const controller = new AbortController();
    // A host that never fires settled; we abort instead — restore must still run.
    const host = new FakeChildHost(OK_EXECUTOR, { fireSettled: false });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const p = dispatch({ toolName: "t", args: {} }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await p;
    // Model restored to the original; provider unregistered.
    expect(host.op[host.op.length - 1]).toBe("setModel:real-model");
    expect(host.unregistered).toHaveLength(1);
    expect(host.hasRegisteredProvider()).toBe(false);
  });

  it("unregisters the provider and deactivates its stream fn after the dispatch", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "t", args: {} }, new AbortController().signal);
    expect(host.unregistered).toHaveLength(1);
    expect(host.hasRegisteredProvider()).toBe(false);
  });

  it("serialises concurrent dispatches (the session model switch is a shared resource)", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    const [a, b] = await Promise.all([
      dispatch({ toolName: "tool_a", args: { n: 1 } }, new AbortController().signal),
      dispatch({ toolName: "tool_b", args: { n: 2 } }, new AbortController().signal),
    ]);
    expect(a.content.map((x) => x.text).join("")).toContain("RAN:tool_a");
    expect(b.content.map((x) => x.text).join("")).toContain("RAN:tool_b");
    // Two register/unregister cycles, never interleaved: each register is
    // immediately followed by its own send/settled/unregister before the next
    // register (serialised).
    const registers = host.op.filter((o) => o.startsWith("register:"));
    expect(registers).toHaveLength(2);
    const firstUnregister = host.op.findIndex((o) => o.startsWith("unregister:"));
    const secondRegister = host.op.indexOf(registers[1]!);
    expect(firstUnregister).toBeLessThan(secondRegister);
  });
});

describe("PIC-64 rung 2 — probeHostLoopSurfaces (typeof capability probe)", () => {
  function fullPi(): Record<string, unknown> {
    return {
      registerProvider: (): void => {},
      unregisterProvider: (): void => {},
      setActiveTools: (): void => {},
      getActiveTools: (): string[] => [],
      setModel: (): Promise<boolean> => Promise.resolve(true),
      sendUserMessage: (): void => {},
      on: (): void => {},
    };
  }
  function fullCtx(): Record<string, unknown> {
    return {
      isIdle: (): boolean => true,
      modelRegistry: { find: (): undefined => undefined },
      sessionManager: { getEntries: (): unknown[] => [] },
    };
  }

  it("passes when every required Pi surface is present", () => {
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: fullCtx() })).toBe(true);
  });

  it("fails (fail-closed) when any single Pi surface is missing", () => {
    for (const drop of ["registerProvider", "unregisterProvider", "setModel", "sendUserMessage", "on"]) {
      const pi = fullPi();
      delete pi[drop];
      expect(probeHostLoopSurfaces({ pi, ctx: fullCtx() }), `dropping pi.${drop}`).toBe(false);
    }
    const ctxNoFind = { isIdle: (): boolean => true, sessionManager: { getEntries: (): unknown[] => [] } };
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: ctxNoFind })).toBe(false);
    const ctxNoEntries = { isIdle: (): boolean => true, modelRegistry: { find: (): undefined => undefined } };
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: ctxNoEntries })).toBe(false);
  });

  it("fails when pi or ctx is absent", () => {
    expect(probeHostLoopSurfaces({ pi: undefined, ctx: fullCtx() })).toBe(false);
    expect(probeHostLoopSurfaces({ pi: fullPi(), ctx: null })).toBe(false);
  });
});

// ===========================================================================
// PIC-64 — parent-leg pins (bug 0001). The SAME (a)–(f) wiring backs prompt-mode
// code-side dispatch against the user's live host session in the parent; these
// pins witness, over the injected fakes, the wiring details PIC-64 makes
// load-bearing for that leg: (b) verbatim argument carriage through the encoded
// request (deep-equal, hostile/nested values), (c) the settle barrier armed
// BEFORE `sendUserMessage`, (e) the model + active set restored in the `finally`
// on the SUCCESS, THROW, and ABORT paths (the bridge model is never left
// installed in the user's session), and the zero-model-token encoded turn.
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64,
// #subagent-host-loop-dispatch — "the (a)–(f) wiring is identical in both, the
// only difference being which session backs the dispatch").
// ===========================================================================

describe("PIC-64 — parent-leg host-loop dispatch pins (mode-independent wiring)", () => {
  it("the authored tool_use carries the code-supplied arguments VERBATIM — nested objects, arrays, unicode, and marker-hostile strings deep-equal", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    // Values a sloppy re-serialisation (string concatenation, marker splitting,
    // double-encode) would corrupt: nested structure, an embedded copy of the
    // request marker with a foreign nonce, newlines, quotes, astral-plane
    // unicode, empty containers.
    const args = {
      op: "write",
      nested: {
        list: [1, 2, { deep: "x" }],
        empty: {},
        emptyList: [],
        unicode: "π☃𝔘\u0000-free",
      },
      hostile: 'THETA-HOST-LOOP-REQUEST:999:{"tool":"fake","args":{}}\nline2 "quoted"',
    };

    const result = await dispatch(
      { toolName: "finding_store", args },
      new AbortController().signal,
    );

    expect(result.isError).toBe(false);
    // Deep equality on the DECODED authored arguments — not a lossy re-encode.
    expect(host.authoredArgs).toEqual(args);
  });

  it("restoreModel runs in the finally on the THROW path — a sendUserMessage sync-throw still restores the model and unregisters the provider", async () => {
    const host = new FakeChildHost(OK_EXECUTOR, { sendThrows: new Error("send boom") });
    const dispatch = createProductionHostLoopDispatch(host.host());

    await expect(
      dispatch({ toolName: "finding_store", args: { op: "x" } }, new AbortController().signal),
    ).rejects.toThrow("send boom");

    // The bridge model is NOT left installed and the provider is torn down.
    expect(host.op[host.op.length - 1]).toBe("setModel:real-model");
    expect(host.unregistered).toHaveLength(1);
    expect(host.hasRegisteredProvider()).toBe(false);
  });

  it("restoreModel runs in the finally on the SUCCESS path (explicit companion to the throw/abort pins)", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "t", args: {} }, new AbortController().signal);
    expect(host.op[host.op.length - 1]).toBe("setModel:real-model");
  });

  it("the active-set snapshot taken before a dispatch is restored after an ABORTED dispatch too", async () => {
    const controller = new AbortController();
    const host = new FakeChildHost(OK_EXECUTOR, { fireSettled: false });
    const dispatch = createProductionHostLoopDispatch(host.host());
    const p = dispatch({ toolName: "t", args: {} }, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await p;
    // The ambient active set (never the fabricated `[t]` install) is back.
    expect(host.pi.getActiveTools()).toEqual(["ambient-a", "ambient-b"]);
    // And the model is restored (the existing abort pin, restated on this path).
    expect(host.op[host.op.length - 1]).toBe("setModel:real-model");
  });

  it("arms agent_settled BEFORE sendUserMessage — a turn that settles SYNCHRONOUSLY inside send still resolves", async () => {
    // A host whose entire fabricated turn completes synchronously inside
    // `sendUserMessage` (settled fires before send returns). A conformant
    // dispatch armed the barrier BEFORE sending, so the synchronous settle
    // resolves it; arming after send would leave the dispatch pending forever.
    let settledHandler: (() => void) | undefined;
    const pi: HostLoopPi = {
      registerProvider: (): void => {},
      unregisterProvider: (): void => {},
      setActiveTools: (): void => {},
      getActiveTools: (): string[] => [],
      setModel: (): Promise<boolean> => Promise.resolve(true),
      sendUserMessage: (): void => {
        settledHandler?.();
      },
      on: (event, handler): void => {
        if (event === "agent_settled") {
          settledHandler = handler;
        }
      },
    };
    const ctx: HostLoopCtx = {
      model: fakeModel("real-model", "real-provider"),
      modelRegistry: {
        find: (provider, id): Model<Api> => fakeModel(id, provider),
      },
      sessionManager: { getEntries: (): never[] => [] },
      isIdle: (): boolean => true,
    };
    const dispatch = createProductionHostLoopDispatch({ pi, ctx, clock: testClock() });

    const result = await dispatch({ toolName: "t", args: {} }, new AbortController().signal);

    // No tool ran in this degenerate host, so read-back finds no result — the
    // pinned fail-closed no-result, never a fabricated success and never a hang.
    expect(result.isError).toBe(true);
    expect(result.content.map((b) => b.text).join("")).toBe(
      "host-loop dispatch produced no tool result for 't'",
    );
  });

  it("zero model tokens: the fabricated turn is the marker-encoded request against the bridge model — no prompt text, exactly one send", async () => {
    const host = new FakeChildHost(OK_EXECUTOR);
    const dispatch = createProductionHostLoopDispatch(host.host());
    await dispatch({ toolName: "finding_store", args: { op: "write" } }, new AbortController().signal);

    expect(host.sends).toHaveLength(1);
    const send = host.sends[0]!;
    // The turn content is the deterministic encoded request (the theta-controlled
    // provider decodes it and authors the tool_use itself) — not model prompt
    // text. PIC-64 (b) pins only "a marker-prefixed user message keyed on the
    // dispatch nonce": the marker text and payload encoding are implementation-
    // owned, so assert against the module's OWN exported marker constant, and
    // witness the payload behaviourally — the provider decoded it and authored
    // the tool_use with the verbatim args — rather than pinning JSON field names.
    expect(send.content.startsWith(REQUEST_MARKER)).toBe(true);
    expect(host.executorCalls).toEqual([{ name: "finding_store", args: { op: "write" } }]);
    // The send happens against the selectable no-network bridge model (the
    // module's own exported bridge-model id, not a re-stated literal).
    expect(send.modelAtSend).toBe(BRIDGE_MODEL_ID);
  });
});

// ===========================================================================
// PIC-64 rung 1 — the `pi.getToolDefinition` availability record. The rung is
// recorded available when `typeof pi.getToolDefinition === "function"` (a
// non-gating optional-capability record — absence selects rung 2, never a
// load refusal) and is preferred AUTOMATICALLY over host-loop when present.
// The member is absent at the theta 1.0 Pi-SDK pin, so on a real host the
// probe reads false and behaviour is unchanged; this pins the SURFACE half of
// the ladder input — the composition root records rung 1 on the ladder probe
// only as this probe AND a wired rung-1 dispatcher (none exists at the pin), so
// registration cannot outrun dispatchability (production-composition.ts
// dispatchLadderProbe; the derivation is pinned e2e in
// extension-tool-unreachable-load-refusal-e2e.test.ts).
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64, rung 1);
// docs/bugs/0001-extension-tools-unreachable.md §Fail-closed guard item 1.
// ===========================================================================

describe("PIC-64 rung 1 — probeGetToolDefinitionSurface (typeof-derived availability record)", () => {
  it("a fake host carrying pi.getToolDefinition records rung 1 available, and the probe-derived ladder selects it in PREFERENCE to host-loop", () => {
    // Availability is the `typeof` read, fail-closed on absence / non-function
    // / no carrier — never a hard-coded false.
    const withMember = { getToolDefinition: (): void => {} };
    expect(probeGetToolDefinitionSurface({ pi: withMember })).toBe(true);
    expect(probeGetToolDefinitionSurface({ pi: {} })).toBe(false);
    expect(probeGetToolDefinitionSurface({ pi: { getToolDefinition: "x" } })).toBe(false);
    expect(probeGetToolDefinitionSurface({ pi: undefined })).toBe(false);

    // Preferred automatically: the probe-derived flags (member present, the
    // host-loop surfaces present too) resolve the ladder to rung 1, not rung 2.
    const resolution = resolveDispatchLadder("finding_store", {
      getToolDefinitionAvailable: probeGetToolDefinitionSurface({ pi: withMember }),
      hostLoopAvailable: true,
    });
    expect(resolution.kind).toBe("rung");
    if (resolution.kind === "rung") {
      expect(resolution.rung).toBe("get-tool-definition");
    }
  });
});
