// Diagnose-only isolation of 0499: actual LivePromptQueryModel, governor,
// OwnedTurnAttempt and current SDK projection. No parser/binder/executor or
// provider: dispatch and poll time are scripted. The immutable composition
// and live witnesses establish the production/real-host boundary separately.
import { describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import type { ActiveRespondCapture, RespondTurnContext } from "../src/extension/respond-capture";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { thisTurnSettled, TURN_SETTLE_POLL_BOUND } from "../src/extension/turn-settlement";
import { classifyHostRecoverySettle } from "../src/extension/host-recovery";
import { extractPromptModeQueryResult } from "../src/runtime/prompt-transport-mapping";
import type { FreePhaseTurn } from "../src/runtime/query-tool-loop";

const MODEL = { id: "b0499-fixture", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const QUERY = "Review the next shard";
const PARTIAL = "one file of fifteen reviewed";
const ERROR = "provider returned error: b0499 omitted attempt";
const NEWEST_ERROR = "provider returned error: b0499 newest omitted attempt";
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api,
    provider: MODEL.provider, model: MODEL.id, timestamp: 0, stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }) } as AssistantMessage;
}
function user(text: string): Message { return { role: "user", content: text, timestamp: 0 }; }
function toolResult(): Message {
  return { role: "toolResult", toolCallId: "call-1", toolName: "review", content: [{ type: "text", text: "file reviewed" }], isError: false, timestamp: 0 };
}
function messages(sm: SessionManager): readonly Message[] {
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
type Shape = "unhealed" | "pure-tool" | "round-zero" | "healed" | "visible" | "newest" | "length" | "tool-edit-only" | "replacement" | "prior-target" | "old-omission";
function rig(shape: Shape, options: { typed?: boolean; capture?: boolean; abort?: "recorded" | "theta" } = {}) {
  const sm = SessionManager.inMemory();
  let priorId: string | undefined;
  if (shape === "prior-target" || shape === "old-omission") {
    sm.appendMessage(user("previous query"));
    priorId = sm.appendMessage(assistant("old failure", "error", ERROR));
    if (shape === "old-omission") sm.appendContextEdit(priorId, null);
  }
  const thetaAbort = new AbortController();
  const hostAbort = new AbortController();
  const reason = new Error("observed cancel");
  let capture: ActiveRespondCapture | undefined;
  let idle = true;
  let pending = false;
  let polls = 0;
  let timerId = 0;
  const timers = new Set<number>();
  const sends: string[] = [];
  const notes: string[] = [];
  const tick = () => {
    if (!pending) return;
    pending = false;
    if (options.capture) { capture!.captured = true; capture!.payload = { score: 5 }; }
    if (["prior-target", "old-omission", "tool-edit-only", "replacement"].includes(shape)) {
      const answer = sm.appendMessage(assistant("completed answer"));
      if (shape === "prior-target") sm.appendContextEdit(priorId!, null);
      if (shape === "replacement") sm.appendContextEdit(answer, { content: [{ type: "text", text: "edited answer" }] });
      if (shape === "tool-edit-only") {
        const tool = sm.appendMessage(toolResult());
        sm.appendContextEdit(tool, null);
      }
    } else {
      if (shape !== "round-zero" && shape !== "length") {
        sm.appendMessage({ ...assistant(shape === "pure-tool" ? "" : PARTIAL, "toolUse"),
          content: [...(shape === "pure-tool" ? [] : [{ type: "text" as const, text: PARTIAL }]),
            { type: "toolCall", id: "call-1", name: "review", arguments: {} }] });
        sm.appendMessage(toolResult());
      }
      const failed = sm.appendMessage(assistant("failed narration", shape === "length" ? "length" : "error", shape === "length" ? undefined : ERROR));
      if (shape !== "visible") sm.appendContextEdit(failed, null);
      if (shape === "healed") sm.appendMessage(assistant("completed retry"));
      if (shape === "newest") {
        const second = sm.appendMessage(assistant("second failure", "error", NEWEST_ERROR));
        sm.appendContextEdit(second, null);
        const tool = sm.appendMessage(toolResult());
        sm.appendContextEdit(tool, null); // tool edits must not mask the assistant omission
      }
    }
    if (options.abort === "recorded") hostAbort.abort(reason);
    if (options.abort === "theta") thetaAbort.abort(reason);
    idle = true;
  };
  const pi = { sendUserMessage: (text: string) => { sends.push(text); sm.appendMessage(user(text)); idle = false; pending = true; },
    getActiveTools: () => [], setActiveTools: () => {}, sendMessage: (note: { content: string }) => notes.push(note.content),
  } as unknown as ExtensionAPI;
  const respond: RespondTurnContext = {
    toolName: "__theta_respond_b0499", lowered: { type: "object" }, template: "Return the review score",
    model: MODEL, auth: async () => undefined, signal: thetaAbort.signal, validate: () => ({ ok: true }),
    captureHost: { setActiveCapture: (slot) => { capture = slot; }, clearActiveCapture: () => { capture = undefined; } },
  };
  const model = new LivePromptQueryModel({
    pi, ctx: { model: MODEL, get signal() { return options.abort === "recorded" ? hostAbort.signal : undefined; },
      isIdle: () => idle, waitForIdle: async () => {}, abort: () => { idle = true; } },
    clock: { now: () => polls * 10, wallNow: () => 0, setTimeout: (fn, ms) => {
      const id = ++timerId;
      if (ms === 10) { polls++; tick(); fn(); } else timers.add(id);
      return id;
    }, clearTimeout: (id) => { timers.delete(id as number); } },
    queryText: QUERY, readMessages: () => messages(sm), readContextPath: () => sm.getBranch(),
    activeTools: [], thetaAbort, governor: new PromptToolLoopGovernor(), maxRounds: 3,
    provider: MODEL.api, thetaName: "b0499unit", emitDiagnostic: () => {}, ...(options.typed ? { respond } : {}),
  });
  async function turn() {
    const result = await model.nextFreePhaseTurn(0);
    expect(sends).toEqual([QUERY]);
    expect(notes, "no invented recovery ride without a recorded retryable settle").toEqual([]);
    expect(timers.size, "idle-race timer must be cleared").toBe(0);
    expect(capture, "capture must detach on all return paths").toBeUndefined();
    if (options.abort === undefined) expect(thetaAbort.signal.aborted).toBe(false);
    console.log("B0499 unit evidence", JSON.stringify({ shape, typed: options.typed ?? false, captured: options.capture ?? false, polls, result }));
    return result;
  }
  return { sm, model, turn, thetaAbort, reason, polls: () => polls };
}
function expectOmission(turn: FreePhaseTurn, detail = ERROR) {
  expect(turn.kind, "B0499_UNIT_UNHEALED: free phase must return transport, never pre-error text").toBe("transport");
  if (turn.kind !== "transport") throw new Error("unreachable assertion guard");
  expect(turn.error).toMatchObject({ kind: "transport", http_status: null, provider: MODEL.api });
  expect((turn.error as { retryable: boolean }).retryable,
    "B0499_UNIT_RETRYABLE: omitted recovery is retryable, not generic lifecycle expiry").toBe(true);
  expect((turn.error as { message: string }).message).toContain(detail);
}

describe("0499 isolated driver omission disposition", () => {
  it.each(["unhealed", "pure-tool", "round-zero"] as const)("%s must fail with the omitted error", async (shape) => {
    const r = rig(shape);
    expectOmission(await r.turn());
  });
  it.each([false, true])("typed free phase must fail before respond (early capture=%s)", async (capture) => {
    expectOmission(await rig("unhealed", { typed: true, capture }).turn());
  });
  it("newest assistant omission wins even with a later tool-result edit", async () => {
    expectOmission(await rig("newest").turn(), NEWEST_ERROR);
  });
  it("omitted length without errorMessage must name its raw stop reason", async () => {
    expectOmission(await rig("length").turn(), "length");
  });
  it("healthy healed omission binds the completed retry without deleting valid narration", async () => {
    expect(await rig("healed").turn()).toEqual({ kind: "text", text: `${PARTIAL}\ncompleted retry` });
  });
  it("healthy visible error keeps PIC-51's non-retryable mapping", async () => {
    expect(await rig("visible").turn()).toEqual({ kind: "transport", error: {
      kind: "transport", message: ERROR, http_status: null, provider: MODEL.api, retryable: false,
    } });
  });
  it.each(["prior-target", "old-omission", "tool-edit-only", "replacement"] as const)("healthy %s is not this attempt's unhealed assistant omission", async (shape) => {
    expect(await rig(shape).turn()).toEqual({ kind: "text", text: shape === "replacement" ? "edited answer" : "completed answer" });
  });
  it.each(["unhealed", "round-zero"] as const)("recorded abort with %s still cancels, retaining reason identity", async (shape) => {
    const r = rig(shape, { abort: "recorded" });
    await r.turn();
    expect(r.thetaAbort.signal.reason).toBe(r.reason);
  });
  it("other-source theta cancellation outranks an unhealed omission", async () => {
    const r = rig("unhealed", { abort: "theta" });
    await r.turn();
    expect(r.thetaAbort.signal.reason).toBe(r.reason);
  });
  it("assertion red direction rejects partial text and non-retryable generic expiry", () => {
    expect(() => expectOmission({ kind: "text", text: PARTIAL })).toThrow(/B0499_UNIT_UNHEALED/);
    expect(() => expectOmission({ kind: "transport", error: { kind: "transport", message: "generic expiry",
      http_status: null, provider: MODEL.api, retryable: false } })).toThrow(/B0499_UNIT_RETRYABLE/);
  });
});

describe("0499 component boundary facts (not proposed predicate changes)", () => {
  it("real projection destroys the error evidence while raw branch retains it; settledness and PIC-51 see only toolUse", () => {
    const sm = SessionManager.inMemory();
    const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
    sm.appendMessage(user(QUERY));
    const preError = assistant(PARTIAL, "toolUse");
    sm.appendMessage(preError);
    sm.appendMessage(toolResult());
    const failed = assistant("failed narration", "error", ERROR);
    const id = sm.appendMessage(failed);
    sm.appendContextEdit(id, null);
    const projected = messages(sm);
    expect(sm.getBranch().find((e) => e.id === id)).toMatchObject({ type: "message", message: failed });
    expect(projected).not.toContain(failed);
    expect(thisTurnSettled(projected, 0, sm.getBranch())).toBe(true);
    expect(attempt.read(projected, sm.getBranch(), false)).toMatchObject({ settled: true, foreign: false, relocated: false });
    expect(classifyHostRecoverySettle(projected, preError, MODEL.contextWindow)).toBe("cancel");
    expect(extractPromptModeQueryResult(projected, { aborted: false, provider: MODEL.api })).toEqual({ ok: true, value: PARTIAL });
    // These functions individually consume their documented projection inputs.
    // The defect is accepting that projection without a raw-omission check in
    // the driver, NOT permission to reinterpret toolUse or raw-aware PIC-78.
  });
  it("round-zero loses every assistant, so its existing settle predicate never opens", async () => {
    const r = rig("round-zero");
    await r.turn();
    expect(messages(r.sm).map((m) => m.role)).toEqual(["user"]);
    expect(thisTurnSettled(messages(r.sm), 0, r.sm.getBranch())).toBe(false);
    expect(r.polls()).toBe(1 + TURN_SETTLE_POLL_BOUND);
  });
});
