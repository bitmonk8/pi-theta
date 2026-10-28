// 0500 retained-answer policy: real SDK projection and the production driver;
// only host timing/dispatch are scripted. No provider and no raw text recovery.
import { describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { thisTurnSettled, TURN_SETTLE_POLL_BOUND } from "../src/extension/turn-settlement";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { assistant, user } from "./helpers/agent-message-fixtures";

const QUERY = "What is 263 plus 514?";
const MODEL = { id: "b0500-fixture", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
function reply(text = "777", reason = "stop"): AssistantMessage {
  return { ...assistant(text), stopReason: reason } as AssistantMessage;
}
function messages(sm: SessionManager): readonly Message[] {
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
function setup(history = false) {
  const sm = SessionManager.inMemory();
  if (history) for (let i = 0; i < 6; i++) {
    sm.appendMessage(user(`previous ${i}`)); sm.appendMessage(reply("previous answer"));
  }
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), QUERY);
  const own = sm.appendMessage(user(QUERY));
  return { sm, own, read: () => attempt.read(messages(sm), sm.getBranch(), true) };
}
const toolResult: Message = { role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "receipt" }], isError: false, timestamp: 0 };

describe("0500 terminal retained after bookkeeping-only compaction", () => {
  it.each(["stop", "end_turn"])("terminal %s survives repeated compactions and invisible metadata", (reason) => {
    const r = setup();
    const terminal = reply("777", reason);
    r.sm.appendMessage(terminal);
    r.sm.appendCompaction("first summary", r.own, 100);
    r.sm.appendCustomEntry("bookkeeping", { done: true });
    r.sm.appendCompaction("second summary", r.own, 100);
    r.sm.appendCustomEntry("bookkeeping", { done: true });
    expect(messages(r.sm)).toContain(terminal);
    expect(thisTurnSettled(messages(r.sm), 0, r.sm.getBranch()), "B0500_TERMINAL_RETAINED").toBe(true);
    expect(r.read()).toMatchObject({ settled: true, foreign: false });
  });
  it.each(["pending", "toolUse", "tool_use", "error", "length", "aborted", "deferred", "unknown"])("later %s blocks borrowing an older terminal", (reason) => {
    const r = setup(); r.sm.appendMessage(reply("old terminal")); r.sm.appendMessage(reply("unfinished", reason));
    r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(false);
  });
  it("a later tool receipt blocks an older terminal", () => {
    const r = setup(); r.sm.appendMessage(reply()); r.sm.appendMessage(toolResult);
    r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(false);
  });
  it("terminal spelling with tool calls is not a completed answer", () => {
    const r = setup(); r.sm.appendMessage({ ...reply(), content: [{ type: "toolCall", id: "t1", name: "read", arguments: {} }] });
    r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(false);
  });
  it.each(["custom", "bash", "branch"])("later substantive %s input is not bookkeeping", (kind) => {
    const r = setup(); r.sm.appendMessage(reply());
    if (kind === "custom") r.sm.appendCustomMessageEntry("input", "new instructions", true);
    else if (kind === "bash") r.sm.appendMessage({ role: "bashExecution", command: "pwd", output: "/project", exitCode: 0, cancelled: false, truncated: false, timestamp: 0 });
    else r.sm.branchWithSummary(r.sm.getLeafId(), "new context");
    r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(false);
  });
  it.each([null, { content: "replacement answer" }])("an explicitly edited terminal is not reused from raw history (%s)", (replacement) => {
    const r = setup(); r.sm.appendMessage(reply("older terminal"));
    const last = r.sm.appendMessage(reply("raw final must not resurrect"));
    r.sm.appendContextEdit(last, replacement); r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(false);
  });
  it("a compacted-away terminal cannot settle an earlier retained assistant", () => {
    const r = setup(); r.sm.appendMessage(reply());
    const compaction = r.sm.appendCompaction("summary", r.own, 100);
    r.sm.appendCompaction("summary with no retained answer", compaction, 100);
    expect(r.read().settled).toBe(false);
  });
  it("own retained terminal remains bounded before a later foreign answer", () => {
    const r = setup(); const terminal = reply("own answer"); r.sm.appendMessage(terminal);
    r.sm.appendCompaction("summary", r.own, 100);
    r.sm.appendMessage(user("foreign")); r.sm.appendMessage(reply("foreign answer"));
    const own = r.read();
    expect(own).toMatchObject({ settled: true, foreign: true });
    expect(own.messages).toContain(terminal);
    expect(own.messages?.some((message) => message.role === "assistant" && message.content.some((part) => part.type === "text" && part.text === "foreign answer"))).toBe(false);
  });
  it("a no-content terminal remains a definite empty ending", () => {
    const r = setup(); r.sm.appendMessage({ ...reply(), content: [] });
    r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read().settled).toBe(true);
  });
  it("foreign terminal cannot settle unfinished own work", () => {
    const r = setup(); r.sm.appendMessage(reply("unfinished", "toolUse"));
    r.sm.appendCompaction("summary", r.own, 100);
    r.sm.appendMessage(user("foreign")); r.sm.appendMessage(reply("foreign answer"));
    expect(r.read()).toMatchObject({ settled: false, foreign: true });
  });
  it("context-producing input after compaction also blocks the bookkeeping exception", () => {
    const r = setup(); r.sm.appendMessage(reply()); r.sm.appendCompaction("summary", r.own, 100);
    r.sm.appendCustomMessageEntry("new-input", "instructions after compaction", true);
    expect(r.read().settled).toBe(false);
  });
  it("an omitted later failure cannot reveal an older terminal as recovered success", () => {
    const r = setup(); r.sm.appendMessage(reply("older terminal"));
    const failed = r.sm.appendMessage({ ...reply("failure residue", "error"), errorMessage: "provider returned error" });
    r.sm.appendContextEdit(failed, null); r.sm.appendCompaction("summary", r.own, 100);
    expect(r.read()).toMatchObject({ settled: false, omission: { stopReason: "error" } });
  });
  it("ordinary tool-use/empty/failure endings retain their existing settled classification without compaction", () => {
    for (const reason of ["toolUse", "error", "length", "stop"]) {
      const r = setup(); r.sm.appendMessage(reply("", reason));
      expect(r.read().settled).toBe(true);
    }
  });
});

function driver(shape: "ordinary" | "kept-user" | "split-turn", fast: boolean, text = "777", activeAgain = false, cancel = false) {
  const sm = SessionManager.inMemory();
  if (shape !== "ordinary") for (let i = 0; i < 6; i++) { sm.appendMessage(user(`previous ${i}`)); sm.appendMessage(reply("old")); }
  const thetaAbort = new AbortController();
  const cancelReason = new Error("parent cancelled");
  let idle = true; let pending = false; let own = ""; let polls = 0; let timer = 0;
  const timers = new Set<number>(); const sends: string[] = []; const notes: string[] = [];
  const tick = () => {
    if (!pending) return;
    pending = false;
    const answer = sm.appendMessage(reply(text));
    sm.appendCompaction("summary", shape === "split-turn" ? answer : own, 100);
    sm.appendCustomEntry("bookkeeping", { settled: true });
    sm.appendCompaction("second summary", shape === "split-turn" ? answer : own, 100);
    idle = true;
    if (cancel) thetaAbort.abort(cancelReason);
  };
  const model = new LivePromptQueryModel({
    pi: { sendUserMessage: (text: string) => { sends.push(text); own = sm.appendMessage(user(text)); idle = false; pending = true; if (fast) tick(); },
      getActiveTools: () => [], setActiveTools: () => {}, sendMessage: (note: { content: string }) => notes.push(note.content),
    } as unknown as ExtensionAPI,
    ctx: { model: MODEL, signal: undefined, isIdle: () => idle, waitForIdle: async () => { if (activeAgain) idle = false; }, abort: () => { idle = true; } },
    clock: { now: () => polls * 10, wallNow: () => 0, setTimeout: (fn, ms) => { const id = ++timer;
      if (ms === 10) { polls++; tick(); fn(); } else timers.add(id); return id;
    }, clearTimeout: (id) => { timers.delete(id as number); } },
    queryText: QUERY, readMessages: () => messages(sm), readContextPath: () => sm.getBranch(), activeTools: [],
    thetaAbort, governor: new PromptToolLoopGovernor(), maxRounds: 3, provider: MODEL.api, thetaName: "b0500", emitDiagnostic: () => {},
  });
  return { model, sends, notes, timers, thetaAbort, cancelReason, polls: () => polls };
}

describe("0500 real driver retained answer", () => {
  for (const shape of ["ordinary", "kept-user", "split-turn"] as const) for (const fast of [false, true]) {
    it(`${shape}, fast=${fast}: returns retained final answer without settle expiry or replay`, async () => {
      const r = driver(shape, fast);
      expect(await r.model.nextFreePhaseTurn(0), "B0500_DRIVER_RETAINED").toEqual({ kind: "text", text: "777" });
      expect(r.sends).toEqual([QUERY]); expect(r.notes).toEqual([]); expect(r.timers.size).toBe(0);
      expect(r.polls()).toBe(fast ? 0 : 1);
    });
  }
  it("empty terminal answer remains legitimate empty output, not missing output", async () => {
    const r = driver("ordinary", false, "");
    expect(await r.model.nextFreePhaseTurn(0)).toEqual({ kind: "text", text: "" });
  });
  it("retained answer cannot shortcut a resumed active run", async () => {
    const r = driver("kept-user", false, "777", true);
    expect(await r.model.nextFreePhaseTurn(0)).toMatchObject({ kind: "transport", error: { retryable: false } });
    expect(r.polls()).toBe(1 + TURN_SETTLE_POLL_BOUND);
  });
  it("cancellation still outranks retained completion", async () => {
    const r = driver("split-turn", false, "777", false, true);
    await r.model.nextFreePhaseTurn(0);
    expect(r.thetaAbort.signal.reason).toBe(r.cancelReason);
    expect(r.sends).toEqual([QUERY]); expect(r.notes).toEqual([]); expect(r.timers.size).toBe(0);
  });
});
