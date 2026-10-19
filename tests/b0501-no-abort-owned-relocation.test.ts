// 0501 prerequisite: real driver + SDK raw/projected session, scripted clock
// and dispatch only. Covers identity-preserving prior-history edits as well
// as compaction drift; does not change 0500's trailing-compaction contract.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import type { ActiveRespondCapture, RespondTurnContext } from "../src/extension/respond-capture";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { TURN_SETTLE_POLL_BOUND } from "../src/extension/turn-settlement";
import { PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE, PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE } from "../src/runtime/prompt-transport-mapping";

const MODEL = { id: "b0501-fixture", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const QUERY = "What is 263 plus 514?";
function user(text: string): Message { return { role: "user", content: text, timestamp: 0 }; }
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api,
    provider: MODEL.provider, model: MODEL.id, timestamp: 0, stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }) } as AssistantMessage;
}
function messages(sm: SessionManager): readonly Message[] {
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
type Shape = "prior-edit" | "kept-user" | "split-turn" | "unanswered" | "old-compaction";
function rig(shape: Shape, options: { typed?: boolean; capture?: boolean; fast?: boolean; foreign?: boolean;
  ownReply?: boolean; cancel?: boolean; suppressSend?: boolean; resumeDuringIdleWait?: boolean } = {}) {
  const sm = SessionManager.inMemory();
  let priorId = "";
  for (let i = 0; i < 6; i++) {
    sm.appendMessage(user(`previous query ${i}`));
    priorId = sm.appendMessage(assistant(`previous answer ${i}`));
  }
  if (shape === "old-compaction") sm.appendCompaction("old summary", priorId, 10000);
  const start = messages(sm).length;
  const thetaAbort = new AbortController();
  const cancelReason = new Error("parent cancelled");
  let capture: ActiveRespondCapture | undefined;
  let idle = true;
  let pending = false;
  let ownId: string | undefined;
  let polls = 0;
  let timerId = 0;
  const timers = new Set<number>();
  const sends: string[] = [];
  const notes: string[] = [];
  const tick = () => {
    if (!pending) return;
    pending = false;
    if (options.suppressSend) { idle = true; return; }
    if (options.capture) { capture!.captured = true; capture!.payload = { score: 777 }; }
    if (shape === "prior-edit") {
      sm.appendContextEdit(priorId, null);
    } else {
      const failed = sm.appendMessage(assistant("overflow residue", "error", "context overflow"));
      if (shape !== "old-compaction") sm.appendCompaction("own summary", shape === "kept-user" || shape === "unanswered" ? ownId! : failed, 200000);
    }
    if (shape !== "unanswered" && options.ownReply !== false) sm.appendMessage(assistant("777"));
    if (options.foreign) {
      sm.appendMessage(user("foreign query"));
      sm.appendMessage(assistant("222"));
    }
    if (options.cancel) thetaAbort.abort(cancelReason);
    idle = true;
  };
  const pi = { sendUserMessage: (text: string) => {
    sends.push(text);
    if (!options.suppressSend) ownId = sm.appendMessage(user(text));
    idle = false; pending = true;
    if (options.fast) tick();
  }, getActiveTools: () => [], setActiveTools: () => {}, sendMessage: (note: { content: string }) => notes.push(note.content),
  } as unknown as ExtensionAPI;
  const respond: RespondTurnContext = {
    toolName: "__theta_respond_b0501", lowered: { type: "object" }, template: "Return the score",
    model: MODEL, auth: async () => undefined, signal: thetaAbort.signal, validate: () => ({ ok: true }),
    captureHost: { setActiveCapture: (slot) => { capture = slot; }, clearActiveCapture: () => { capture = undefined; } },
  };
  const model = new LivePromptQueryModel({
    pi, ctx: { model: MODEL, signal: undefined, isIdle: () => idle, waitForIdle: async () => {
      if (options.resumeDuringIdleWait) idle = false;
    }, abort: () => { idle = true; } },
    clock: { now: () => polls * 10, wallNow: () => 0, setTimeout: (fn, ms) => {
      const id = ++timerId;
      if (ms === 10) { polls++; tick(); fn(); } else timers.add(id);
      return id;
    }, clearTimeout: (id) => { timers.delete(id as number); } },
    queryText: QUERY, readMessages: () => messages(sm), readContextPath: () => sm.getBranch(),
    activeTools: [], thetaAbort, governor: new PromptToolLoopGovernor(), maxRounds: 3,
    provider: MODEL.api, thetaName: "b0501", emitDiagnostic: () => {}, ...(options.typed ? { respond } : {}),
  });
  async function turn() {
    const result = await model.nextFreePhaseTurn(0);
    expect(sends).toEqual([QUERY]);
    expect(notes, "relocation does not authorize a continuation").toEqual([]);
    expect(timers.size, "idle-race timer cleared").toBe(0);
    expect(capture, "capture detached").toBeUndefined();
    return result;
  }
  return { sm, model, turn, thetaAbort, cancelReason, start, polls: () => polls };
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0501 no-abort owned relocation", () => {
  it.each(["prior-edit", "kept-user", "split-turn"] as const)("%s returns completed own reply without a recorded abort", async (shape) => {
    const r = rig(shape);
    expect(await r.turn(), "B0501_OWN_REPLY: an identifiable completed turn must survive projection drift")
      .toEqual({ kind: "text", text: "777" });
    expect(r.thetaAbort.signal.aborted).toBe(false);
    expect(r.polls(), "completed relocation must not spend the settle bound").toBe(1);
    const own = messages(r.sm).findIndex((m) => m.role === "user" && m.content === QUERY);
    if (shape === "split-turn") expect(own).toBe(-1);
    else expect(own).toBeLessThan(r.start);
  });
  it.each(["prior-edit", "kept-user", "split-turn"] as const)("%s can start and finish between polls", async (shape) => {
    const r = rig(shape, { fast: true });
    expect(await r.turn(), "B0501_FAST_OWN_REPLY: completed drift is started evidence")
      .toEqual({ kind: "text", text: "777" });
    expect(r.polls()).toBe(0);
  });
  it("unanswered compaction keeps the full no-abort settle bound and fails loudly", async () => {
    const r = rig("unanswered");
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { kind: "transport", retryable: false, message: expect.stringContaining("on-session turn did not settle") } });
    expect(r.polls()).toBe(1 + TURN_SETTLE_POLL_BOUND);
  });
  it("a relocated partial cannot become completion evidence after the run resumes", async () => {
    const r = rig("kept-user", { resumeDuringIdleWait: true });
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { retryable: false } });
    expect(r.polls()).toBe(1 + TURN_SETTLE_POLL_BOUND);
  });
  it("a prior compacted reply cannot replace a swallowed own send", async () => {
    const r = rig("old-compaction", { suppressSend: true });
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { retryable: false } });
  });
  it("a surviving drifted own turn stays bounded before the foreign user", async () => {
    const r = rig("prior-edit", { foreign: true });
    expect(await r.turn()).toEqual({ kind: "text", text: "777" });
  });
  it("a foreign reply cannot settle a drifted own send without its own ending", async () => {
    const r = rig("prior-edit", { foreign: true, ownReply: false });
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { message: PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE, retryable: true } });
  });
  it("split-turn fallback never borrows from a foreign span", async () => {
    const r = rig("split-turn", { foreign: true });
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { message: PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE } });
  });
  it.each(["prior-edit", "split-turn"] as const)("theta cancellation outranks %s own reply", async (shape) => {
    const r = rig(shape, { cancel: true });
    await r.turn();
    expect(r.thetaAbort.signal.reason).toBe(r.cancelReason);
  });
});

describe("0501 typed relocated-window policy", () => {
  it.each(["prior-edit", "kept-user", "split-turn"] as const)("%s refuses forced replay and repair replay with no provider dispatch", async (shape) => {
    const r = rig(shape, { typed: true });
    expect(await r.turn(), "B0501_TYPED_FREE_PHASE: completed free phase is still attributable").toEqual({ kind: "text", text: "777" });
    const result = await r.model.forcedRespondTurn();
    expect(result).toMatchObject({ kind: "transport", error: { kind: "transport", retryable: true,
      message: expect.stringContaining(shape === "prior-edit" ? "session projection change relocated" : "compaction relocated") } });
    // A repair may drive another own turn but may never replay the stale window.
    expect(await r.model.driveRepairAttempt("repair")).toMatchObject({ kind: "provider_failure", error: { retryable: true } });
    expect(scripted.calls).toEqual([]);
  });
  it.each(["prior-edit", "split-turn"] as const)("%s early capture still wins without replay", async (shape) => {
    const r = rig(shape, { typed: true, capture: true });
    expect(await r.turn()).toEqual({ kind: "text", text: "777" });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(scripted.calls).toEqual([]);
  });
  it("foreign interleaving takes precedence over capture and relocation", async () => {
    const r = rig("prior-edit", { typed: true, capture: true, foreign: true });
    expect(await r.turn()).toMatchObject({ kind: "transport", error: { message: PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE } });
    expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport", error: { message: PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE } });
    expect(scripted.calls).toEqual([]);
  });
});

it("0501 fresh compaction alone cannot prove a swallowed own send", () => {
  const sm = SessionManager.inMemory();
  sm.appendMessage(user("previous query"));
  const prior = sm.appendMessage(assistant("previous answer"));
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
  sm.appendCompaction("new summary without an enacted send", prior, 200000);
  expect(attempt.read(messages(sm), sm.getBranch(), true)).toMatchObject({ settled: false, messages: undefined });
});

it("0501 relocation cannot authenticate an edited own user by equal text", () => {
  const sm = SessionManager.inMemory();
  sm.appendMessage(user("old query"));
  const prior = sm.appendMessage(assistant("old answer"));
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
  const own = sm.appendMessage(user(QUERY));
  sm.appendMessage(assistant("777"));
  sm.appendContextEdit(prior, null);
  sm.appendContextEdit(own, { content: QUERY });
  expect(attempt.read(messages(sm), sm.getBranch(), true)).toMatchObject({ settled: false, messages: undefined });
});
