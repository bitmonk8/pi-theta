import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, expect, it } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import type { RespondTurnContext } from "../src/extension/respond-capture";
const MODEL = { id: "b0500", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const QUERY = "What is 263 plus 514?";
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api, provider: MODEL.provider, model: MODEL.id, stopReason, timestamp: 0 } as AssistantMessage;
}
function rig(options: { capture?: boolean; foreign?: boolean; omit?: boolean; cancel?: boolean; ending?: AssistantMessage["stopReason"]; validate?: boolean; typed?: boolean; hideTerminal?: boolean; unobserved?: boolean; answer?: string } = {}) {
  const sm = SessionManager.inMemory();
  sm.appendMessage({ role: "user", content: "prior", timestamp: 0 });
  const prior = sm.appendMessage(assistant("B0500_FOREIGN_OLD_ANSWER"));
  const controller = new AbortController();
  let idle = true, pending = false, timers = 0, sends = 0;
  let terminal: AssistantMessage | undefined;
  let receiptObserved = false;
  const notes: string[] = [];
  let slot: Parameters<RespondTurnContext["captureHost"]["setActiveCapture"]>[0] | undefined;
  const respond: RespondTurnContext = { toolName: "__theta_respond_b0500", lowered: { type: "object" }, template: "Return score as number in the response tool.", model: MODEL,
    auth: async () => undefined, signal: controller.signal, validate: () => options.validate === false ? { ok: false, message: "score must be numeric" } : { ok: true },
    captureHost: { setActiveCapture: (value) => { slot = value; }, clearActiveCapture: () => { slot = undefined; } } };
  const model = new LivePromptQueryModel({
    pi: { getActiveTools: () => [], setActiveTools: () => {}, sendMessage: (note: { customType: string; content: string; display: boolean; details?: unknown }) => { notes.push(note.content); sm.appendCustomMessageEntry(note.customType, note.content, note.display, note.details); }, sendUserMessage: (text: string) => {
      sends++; sm.appendMessage({ role: "user", content: text, timestamp: 0 }); idle = false; pending = true;
    } } as unknown as ExtensionAPI,
    ctx: { model: MODEL, signal: undefined, isIdle: () => idle, waitForIdle: async () => {}, abort: () => { idle = true; } },
    clock: { now: () => 0, wallNow: () => 0, setTimeout: (fn, ms) => {
      if (ms !== 10) { timers++; return timers; }
      if (pending) {
        if (!receiptObserved) sm.appendContextEdit(prior, null);
        if (options.hideTerminal && !receiptObserved) {
          sm.appendMessage({ ...assistant("reading", "toolUse"), content: [{ type: "toolCall", id: "receipt", name: "read", arguments: { path: "fixture" } }] });
          sm.appendMessage({ role: "toolResult", toolCallId: "receipt", toolName: "read", content: [{ type: "text", text: "263 plus 514 is 777" }], isError: false, timestamp: 0 });
        }
        if (options.hideTerminal && !receiptObserved && !options.unobserved) {
          receiptObserved = true;
          fn(); return 0;
        }
        pending = false;
        terminal = assistant(options.answer ?? "777", options.ending);
        const answer = sm.appendMessage(terminal);
        if (options.hideTerminal) sm.appendCompaction("SUMMARY_NOT_EVIDENCE", null, 100);
        if (options.omit) sm.appendContextEdit(answer, null);
        if (options.capture) { slot!.captured = true; slot!.payload = { score: 777 }; }
        if (options.foreign) { sm.appendMessage({ role: "user", content: "foreign", timestamp: 0 }); sm.appendMessage(assistant("222")); }
        if (options.cancel) controller.abort("cancel");
        idle = true;
      }
      fn(); return 0;
    }, clearTimeout: (id) => { if (id !== 0) timers--; } },
    queryText: QUERY, readMessages: () => buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[], readContextPath: () => sm.getBranch(),
    activeTools: ["bash"], thetaAbort: controller, governor: new PromptToolLoopGovernor(), maxRounds: 3, provider: MODEL.api, ...(options.typed === false ? {} : { respond }), finalizationContext: { model: MODEL, auth: respond.auth }, thetaName: "b0500", emitDiagnostic: () => {},
  });
  return { model, controller, notes, sm, sends: () => sends, timers: () => timers, capture: () => slot };
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });
it("0500 finalizes an owned completed relocated typed answer in fresh tools-disabled context", async () => {
  scripted.queue.push(() => ({ ...assistant(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } }] }));
  const r = rig();
  expect(await r.model.nextFreePhaseTurn(0)).toEqual({ kind: "text", text: "777" });
  expect(await r.model.forcedRespondTurn(), "B0500_FRESH_FINALIZER: relocation must not preclude a separately attributable finalization").toEqual({ kind: "respond", payload: { score: 777 } });
  expect(scripted.calls).toHaveLength(1);
  const context = scripted.calls[0]!.context as { messages: Message[]; tools: { name: string }[] };
  expect(context.tools.map((tool) => tool.name)).toEqual(["__theta_finalize"]);
  expect(JSON.stringify(context.messages)).toContain(QUERY);
  expect(JSON.stringify(context.messages)).toContain("777");
  expect(JSON.stringify(context.messages)).not.toContain("B0500_FOREIGN_OLD_ANSWER");
  expect(r.sends()).toBe(1);
  expect(r.notes).toHaveLength(1);
  expect(r.timers()).toBe(0);
  expect(r.capture()).toBeUndefined();
});
it("0500 malformed finalization cannot restart operational repair", async () => {
  scripted.queue.push(() => ({ ...assistant(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: "invalid" } } }] }));
  const r = rig({ validate: false });
  await r.model.nextFreePhaseTurn(0);
  expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport", error: { retryable: false } });
  expect(await r.model.driveRepairAttempt("repair")).toMatchObject({ kind: "provider_failure", error: { retryable: false } });
  expect(r.sends()).toBe(1);
  expect(scripted.calls).toHaveLength(1);
});

it.each(["toolUse", "error", "aborted", "length", "pending"] as const)("0500 source %s is not finalization eligibility", async (ending) => {
  const r = rig({ ending }); await r.model.nextFreePhaseTurn(0);
  expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport" });
  expect(scripted.calls).toHaveLength(0);
});
it.each([{ foreign: true }, { omit: true }, { cancel: true }])("0500 refuses unsafe source %j without dispatch", async (options) => {
  const r = rig(options); await r.model.nextFreePhaseTurn(0); await r.model.forcedRespondTurn();
  expect(scripted.calls).toHaveLength(0); expect(r.notes).toHaveLength(0); expect(r.capture()).toBeUndefined();
});
it("0500 existing capture wins over finalization", async () => {
  const r = rig({ capture: true }); await r.model.nextFreePhaseTurn(0);
  expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
  expect(scripted.calls).toHaveLength(0); expect(r.notes).toHaveLength(0);
});
it("0500 one logical attempt is not renewed by repeated response requests", async () => {
  scripted.queue.push(() => ({ ...assistant(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } }] }));
  const r = rig(); await r.model.nextFreePhaseTurn(0);
  expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
  // Its informational note is now persisted context. A later request must not
  // admit a second attempt or retarget the original immutable proof.
  expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport" });
  expect(scripted.calls).toHaveLength(1); expect(r.notes).toHaveLength(1); expect(r.sends()).toBe(1);
});
it("0500 boundary cancellation before finalization prevents all dispatch and notes", async () => {
  const r = rig(); await r.model.nextFreePhaseTurn(0); r.controller.abort("parent");
  await r.model.forcedRespondTurn(); expect(scripted.calls).toHaveLength(0); expect(r.notes).toHaveLength(0);
});
it("0500 a foreign boundary added after settlement prevents finalization", async () => {
  const r = rig(); await r.model.nextFreePhaseTurn(0); r.sm.appendMessage({ role: "user", content: "foreign", timestamp: 0 });
  expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(0);
});

it("0500 real SDK retain-none lost untyped terminal uses previously observed receipts, not raw terminal content", async () => {
  scripted.queue.push(() => assistant(JSON.stringify({ outcome: "answer", text: "777" })));
  const r = rig({ typed: false, hideTerminal: true, answer: "B0500_UNAVAILABLE_RAW_ANSWER" });
  expect(await r.model.nextFreePhaseTurn(0)).toEqual({ kind: "text", text: "777" });
  expect(scripted.calls).toHaveLength(1); expect(r.sends()).toBe(1); expect(r.notes).toHaveLength(1); expect(r.timers()).toBe(0);
  const context = scripted.calls[0]!.context as { messages: Message[]; tools: unknown[] };
  expect(context.tools).toEqual([]); expect(JSON.stringify(context.messages)).not.toContain("B0500_UNAVAILABLE_RAW_ANSWER");
  expect(JSON.stringify(context.messages)).toContain("263 plus 514 is 777");
  const projected = buildSessionContext(r.sm.getEntries(), r.sm.getLeafId()).messages;
  expect(projected.some(message => message.role === "assistant" || message.role === "toolResult")).toBe(false);
  expect(JSON.stringify(context.messages)).not.toContain("SUMMARY_NOT_EVIDENCE");
});
it("0500 an existing empty untyped terminal answer stays empty, with no finalizer", async () => {
  const r = rig({ typed: false, answer: "" });
  expect(await r.model.nextFreePhaseTurn(0)).toEqual({ kind: "text", text: "" }); expect(scripted.calls).toHaveLength(0); expect(r.notes).toHaveLength(0);
});
it("0500 a typed lost terminal can submit once from complete retained receipts", async () => {
  scripted.queue.push(() => ({ ...assistant(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } }] }));
  const r = rig({ hideTerminal: true, answer: "B0500_UNAVAILABLE_TYPED_RAW" });
  expect(await r.model.nextFreePhaseTurn(0)).toEqual({ kind: "text", text: "" });
  expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
  expect(scripted.calls).toHaveLength(1); expect(JSON.stringify(scripted.calls[0]!.context)).not.toContain("B0500_UNAVAILABLE_TYPED_RAW");
});
