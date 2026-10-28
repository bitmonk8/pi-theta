// Direct inversions of the independent round-2 review probes: real SDK branch
// projection, LivePromptQueryModel, typed loop and production repair validation.
// Only the on-session lifecycle and off-session complete() replies are scripted.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Message, Model, ToolCall } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import type { RespondTurnContext } from "../src/extension/respond-capture";
import type { LoweredSchema } from "../src/seams/schema-validator";
import { runTypedQueryLoop } from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { depthWalk } from "../src/runtime/depth-walk";
import { ajv, NOOP_CHECKPOINT, config } from "./helpers/scripted-typed-query-harness";

const MODEL = { id: "b0500-round2-driver", api: "openai-responses", provider: "openai", contextWindow: 200000 } as Model<Api>;
const QUERY = "Compute the score using retained data.";
const BUSINESS: LoweredSchema = { type: "object", properties: { score: { type: "integer" } }, required: ["score"], additionalProperties: false };
const DEPTH_PAYLOAD = { a: { b: { c: { d: { e: { f: 777 } } } } } };
function assistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0 } as AssistantMessage;
}
function submission(metadata: unknown): AssistantMessage {
  return { ...assistant(""), stopReason: "toolUse", content: [{ type: "toolCall", id: "finalize", name: "__theta_finalize", arguments: metadata as ToolCall["arguments"] }] };
}
function answer(payload: unknown): AssistantMessage { return submission({ outcome: "answer", answer: payload }); }
type Options = { lowered?: LoweredSchema; retainNone?: boolean; replaceAt?: "auth" | "reply" };

function rig(options: Options = {}) {
  const manager = SessionManager.inMemory();
  manager.appendMessage({ role: "user", content: "prior unrelated query", timestamp: 0 });
  const prior = manager.appendMessage(assistant("UNRELATED_OLD_ANSWER"));
  const abort = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let idle = true, pending = false, receiptObserved = false, ownId = "";
  const replaceBranch = () => { manager.branch(ownId); manager.appendMessage(assistant("DIFFERENT_BRANCH_ANSWER: score is 888")); };
  const lowered = options.lowered ?? BUSINESS;
  const validator = ajv();
  const compiled = validator.compile(lowered);
  // Both the capture/finalizer and the outer loop use this spy around REAL AJV.
  // A permissive schema must not obscure a depth-before-AJV regression.
  const validate = vi.fn((value: unknown) => compiled.validate(value));
  vi.spyOn(validator, "compile").mockReturnValue({ validate });
  const captureHost = { setActiveCapture: vi.fn(), clearActiveCapture: vi.fn() };
  const respond: RespondTurnContext = {
    toolName: "__theta_respond_round2_driver", lowered, template: "Submit the integer score.", model: MODEL, signal: abort.signal,
    auth: async () => { if (options.replaceAt === "auth") replaceBranch(); return undefined; },
    validate: value => { const result = validate(value); return result.ok ? result : { ok: false, message: "score must be an integer" }; },
    captureHost,
  };
  const sendUserMessage = vi.fn((text: string) => {
    ownId = manager.appendMessage({ role: "user", content: text, timestamp: 0 });
    idle = false; pending = true;
  });
  const sendMessage = vi.fn((note: { customType: string; content: string; display: boolean; details?: unknown }) => {
    // A real persisted note changes the SDK branch; a no-op would hide proof bugs.
    manager.appendCustomMessageEntry(note.customType, note.content, note.display, note.details);
  });
  const governor = new PromptToolLoopGovernor();
  const begin = vi.spyOn(governor, "begin");
  const model = new LivePromptQueryModel({
    pi: { getActiveTools: () => [], setActiveTools: () => {}, sendUserMessage, sendMessage } as unknown as ExtensionAPI,
    ctx: { model: MODEL, signal: undefined, isIdle: () => idle, waitForIdle: async () => {}, abort: () => { idle = true; } },
    clock: {
      now: () => 0, wallNow: () => 0,
      setTimeout: (fn, ms) => {
        if (ms !== 10) {
          const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
          timers.add(timer); return timer;
        }
        if (pending) {
          if (options.retainNone && !receiptObserved) {
            manager.appendMessage({ ...assistant("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: "read", name: "read", arguments: {} }] });
            manager.appendMessage({ role: "toolResult", toolCallId: "read", toolName: "read", content: [{ type: "text", text: "Observed receipt score: 777" }], isError: false, timestamp: 0 });
            receiptObserved = true;
            // Let the driver observe this complete pair before compaction.
            fn(); return 0;
          }
          pending = false;
          manager.appendMessage(assistant(options.retainNone ? "UNAVAILABLE_RAW_TERMINAL" : "original eligible answer: score is 777"));
          if (options.retainNone) manager.appendCompaction("SUMMARY_IS_NOT_EVIDENCE", null, 100);
          else manager.appendContextEdit(prior, null);
          idle = true;
        }
        fn(); return 0;
      },
      clearTimeout: handle => { if (handle !== 0) { clearTimeout(handle as ReturnType<typeof setTimeout>); timers.delete(handle as ReturnType<typeof setTimeout>); } },
    },
    queryText: QUERY,
    readMessages: () => buildSessionContext(manager.getEntries(), manager.getLeafId()).messages as readonly Message[],
    readContextPath: () => manager.getBranch(), activeTools: [], thetaAbort: abort, governor, maxRounds: 3,
    provider: MODEL.api, respond, thetaName: "round2-driver", emitDiagnostic: () => {},
  });
  const driveRepairAttempt = vi.spyOn(model, "driveRepairAttempt");
  const forcedRespondTurn = vi.spyOn(model, "forcedRespondTurn");
  const driveFollowUp = vi.fn((prompt: string) => model.driveRepairAttempt(prompt));
  async function run(attempts: number, reply: () => AssistantMessage) {
    scripted.queue.push(() => { if (options.replaceAt === "reply") replaceBranch(); return reply(); });
    const validation = buildTypedQueryValidation({ lowered, schemaValidator: validator, attempts, maxRounds: 3, respondToolName: respond.toolName, driveFollowUp });
    const runRespondRepair = vi.spyOn(validation, "runRespondRepair");
    try {
      const outcome = await runTypedQueryLoop(NOOP_CHECKPOINT, abort.signal, model, { ...config("round2-driver"), maxRounds: 3 }, validation);
      return { outcome, runRespondRepair };
    } finally {
      abort.abort("test cleanup");
      for (const timer of timers) clearTimeout(timer);
    }
  }
  return { run, manager, validate, captureHost, begin, sendUserMessage, sendMessage, driveFollowUp, driveRepairAttempt, forcedRespondTurn, timers };
}

function expectNoReplay(r: ReturnType<typeof rig>, completeCalls = 1) {
  expect(r.captureHost.setActiveCapture, "only the original free phase arms capture; recovery never rearms it").toHaveBeenCalledTimes(1);
  expect(r.captureHost.clearActiveCapture).toHaveBeenCalledTimes(1);
  expect(r.begin, "no second operational governor window").toHaveBeenCalledTimes(1);
  expect(r.sendUserMessage, "no operational replay").toHaveBeenCalledTimes(1);
  expect(r.sendUserMessage).toHaveBeenCalledWith(QUERY);
  expect(r.driveFollowUp).not.toHaveBeenCalled();
  expect(r.driveRepairAttempt, "do not even enter the repair driver").not.toHaveBeenCalled();
  expect(r.forcedRespondTurn, "no recursive finalizer").toHaveBeenCalledTimes(1);
  expect(scripted.calls).toHaveLength(completeCalls);
  expect(r.timers.size).toBe(0);
}
function expectFailure(outcome: unknown) {
  expect(outcome).toMatchObject({ kind: "transport", error: { kind: "transport", retryable: false, message: expect.stringContaining("finalization failed") } });
}

beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0500 round-2 direct driver and typed-loop invariants", () => {
  for (const attempts of [0, 3]) {
    it.each([
      { name: "depth-invalid under permissive schema", lowered: {}, reply: () => answer(DEPTH_PAYLOAD), ajvCalls: 0 },
      { name: "schema-invalid integer score", lowered: BUSINESS, reply: () => answer({ score: "not an integer" }), ajvCalls: 1 },
      { name: "malformed metadata", lowered: BUSINESS, reply: () => submission({ outcome: "abstain", answer: { score: 777 } }), ajvCalls: 0 },
      { name: "abstain", lowered: BUSINESS, reply: () => submission({ outcome: "abstain" }), ajvCalls: 0 },
      { name: "missing submission", lowered: BUSINESS, reply: () => assistant("No recovery submission"), ajvCalls: 0 },
      { name: "ambiguous submissions", lowered: BUSINESS, reply: () => ({ ...answer({ score: 777 }), content: [...answer({ score: 777 }).content, ...answer({ score: 888 }).content] }), ajvCalls: 0 },
    ])("$name fails terminally without capture rearm (repair budget=" + attempts + ")", async fixture => {
      const r = rig({ lowered: fixture.lowered });
      // Pin the reviewer's co-fire independently of the schema's permissiveness.
      expect(depthWalk(DEPTH_PAYLOAD).ok).toBe(false);
      const { outcome, runRespondRepair } = await r.run(attempts, fixture.reply);
      expectFailure(outcome);
      expect(runRespondRepair).not.toHaveBeenCalled();
      expect(r.validate, "metadata/abstention/depth reject BEFORE actual AJV").toHaveBeenCalledTimes(fixture.ajvCalls);
      if (fixture.ajvCalls) {
        expect(r.validate).toHaveBeenCalledWith({ score: "not an integer" });
        expect(r.validate.mock.results[0]!.value).toMatchObject({ ok: false });
      }
      expectNoReplay(r);
      expect(r.sendMessage).toHaveBeenCalledTimes(1);
      const notes = r.manager.getBranch().filter(entry => entry.type === "custom_message" && entry.customType === "theta-system-note");
      expect(notes).toHaveLength(1);
      const context = scripted.calls[0]!.context as Context;
      expect(context.tools?.map(tool => tool.name)).toEqual(["__theta_finalize"]);
      expect(JSON.stringify(context.messages)).toContain("original eligible answer");
      expect(JSON.stringify(context.messages)).not.toContain("UNRELATED_OLD_ANSWER");
    });
  }

  it("a valid recovered score binds through the real outer validator despite the persisted note", async () => {
    const r = rig();
    const { outcome, runRespondRepair } = await r.run(3, () => answer({ score: 777 }));
    expect(outcome).toMatchObject({ kind: "value", value: { score: 777 } });
    expect(runRespondRepair).not.toHaveBeenCalled();
    expect(r.validate).toHaveBeenCalledTimes(2); // finalizer + outer typed validation
    expectNoReplay(r);
    expect(r.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each(["auth", "reply"] as const)("rejects the OLD proof when the SDK branch is replaced during %s", async replaceAt => {
    const r = rig({ replaceAt });
    const { outcome, runRespondRepair } = await r.run(3, () => answer({ score: 777 }));
    expectFailure(outcome);
    expect(runRespondRepair).not.toHaveBeenCalled();
    expect(r.validate).not.toHaveBeenCalled();
    expectNoReplay(r, replaceAt === "auth" ? 0 : 1);
    expect(r.sendMessage).toHaveBeenCalledTimes(1); // attempt note precedes async auth/dispatch
    expect(JSON.stringify(buildSessionContext(r.manager.getEntries(), r.manager.getLeafId()).messages)).toContain("DIFFERENT_BRANCH_ANSWER");
  });

  it("SDK retain-none uses previously observed receipts, not the unavailable raw terminal or summary", async () => {
    const r = rig({ retainNone: true });
    const { outcome, runRespondRepair } = await r.run(3, () => answer({ score: 777 }));
    expect(outcome).toMatchObject({ kind: "value", value: { score: 777 } });
    expect(runRespondRepair).not.toHaveBeenCalled();
    expectNoReplay(r);
    const context = JSON.stringify((scripted.calls[0]!.context as Context).messages);
    expect(context).toContain("Observed receipt score: 777");
    expect(context).not.toContain("UNAVAILABLE_RAW_TERMINAL");
    expect(context).not.toContain("SUMMARY_IS_NOT_EVIDENCE");
    const projection = buildSessionContext(r.manager.getEntries(), r.manager.getLeafId()).messages;
    expect(projection.some(message => message.role === "assistant" || message.role === "toolResult")).toBe(false);
  });
});
