// Round-2 outer regressions: real parser/producer/executor/AJV and SDK branch
// projection. Only the on-session lifecycle and off-session provider are scripted.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI, type ExtensionCommandContext, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { executeBody } from "../src/runtime/statement-executor";
import { depthWalk } from "../src/runtime/depth-walk";
import { rootDouble, thetaInput } from "./helpers/scripted-live-session-harness";
import { b0500Assistant } from "./helpers/b0500-finalization-composition";

const MODEL = { id: "b0500-round2", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const QUERY = "Return the score from the completed work.";
const source = (attempts: number) => `---\nmode: prompt\ntools: []\nrespond_repair:\n  attempts: ${attempts}\n---\nschema Verdict { score: integer }\nlet answer = @<Verdict>\`${QUERY}\`?\nanswer\n`;
type Boundary = "auth" | "reply" | "fallback";

beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

async function composition(input: { boundary?: Boundary; payload?: unknown; attempts?: number } = {}) {
  const manager = SessionManager.inMemory();
  manager.appendMessage({ role: "user", content: "old query", timestamp: 0 });
  const priorId = manager.appendMessage(b0500Assistant(MODEL, "unrelated history"));
  let ownId = "", idle = true, pending = false, sends = 0;
  const controller = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const replaceBranch = () => { manager.branch(ownId); manager.appendMessage(b0500Assistant(MODEL, "Correction: score is 888, not 777.")); };
  const registry = { getAvailable: () => [MODEL], getApiKeyAndHeaders: async () => { if (input.boundary === "auth") replaceBranch(); return { ok: true }; } } as unknown as ModelRegistry;
  const pi = {
    sendUserMessage(text: string) { sends++; ownId = manager.appendMessage({ role: "user", content: text, timestamp: 0 }); idle = false; pending = true; },
    getActiveTools: () => [], setActiveTools: () => {}, registerTool: () => {}, on: () => () => {},
    sendMessage(note: { customType: string; content: string; display: boolean; details?: unknown }) {
      manager.appendCustomMessageEntry(note.customType, note.content, note.display, note.details);
    },
  } as unknown as ExtensionAPI;
  const ctx = { model: MODEL, signal: undefined, sessionManager: manager, isIdle: () => idle, waitForIdle: async () => {}, abort: () => { idle = true; } } as unknown as ExtensionCommandContext;
  const root = rootDouble({ clock: {
    now: () => performance.now(), wallNow: () => Date.now(),
    setTimeout: (fn, ms) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (ms === 10 && pending) {
          pending = false;
          manager.appendMessage(b0500Assistant(MODEL, "Completed work: score is 777."));
          manager.appendContextEdit(priorId, null);
          idle = true;
        }
        fn();
      }, ms);
      timers.add(timer); return timer;
    },
    clearTimeout: handle => { clearTimeout(handle as ReturnType<typeof setTimeout>); timers.delete(handle as ReturnType<typeof setTimeout>); },
  } });
  const compile = root.schemaValidator.compile.bind(root.schemaValidator);
  const ajvDepths: boolean[] = [];
  vi.spyOn(root.schemaValidator, "compile").mockImplementation(lowered => {
    const compiled = compile(lowered);
    return { ...compiled, validate(value: unknown) { ajvDepths.push(depthWalk(value).ok); return compiled.validate(value); } };
  });
  const repair = vi.spyOn(LivePromptQueryModel.prototype, "driveRepairAttempt");
  const governor = vi.spyOn(PromptToolLoopGovernor.prototype, "begin");
  scripted.queue.push(call => {
    if (input.boundary === "reply" || input.boundary === "fallback") replaceBranch();
    if (input.boundary === "fallback") throw new Error("tool_choice named tool not supported");
    const name = (call.context as Context).tools![0]!.name;
    return { ...b0500Assistant(MODEL, ""), stopReason: "toolUse", content: [{ type: "toolCall", id: "submit", name, arguments: input.payload ?? { outcome: "answer", answer: { score: 777 } } }] };
  });
  const theta = thetaInput(source(input.attempts ?? 3), { slashName: "round2", sourcePath: "/synthetic/b0500-round2.theta" });
  const producer = createProductionProducerDeps({ pi, root, modelRegistry: registry });
  const binding = producer.bindPromptConversation({ theta, args: "", ctx, thetaAbort: controller });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return { execution, ajvDepths, manager, sends, repairs: repair.mock.calls.length, governorStarts: governor.mock.calls.length, remainingTimers: timers.size };
  } finally {
    controller.abort("scratch cleanup"); await binding.finishInvocation?.();
    for (const timer of timers) clearTimeout(timer);
    repair.mockRestore(); governor.mockRestore();
  }
}

function expectNoReplay(result: Awaited<ReturnType<typeof composition>>) {
  expect(result.sends, "one original user turn; no operational replay").toBe(1);
  expect(result.repairs, "recovery failure must not ENTER the outer repair driver").toBe(0);
  expect(result.governorStarts, "only the original free phase arms the operational governor").toBe(1);
  expect(result.remainingTimers).toBe(0);
}

describe("0500 round-2 outer production invariants", () => {
  it("SDK-persisted informational note does not invalidate its own proof", async () => {
    const result = await composition();
    expect(result.execution.outcome).toBe("success");
    expect(result.execution.result.value).toEqual({ score: 777 });
    const notes = result.manager.getBranch().filter(entry => entry.type === "custom_message" && entry.customType === "theta-system-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ content: expect.stringContaining("finalizing unavailable query output") });
    expect(scripted.calls).toHaveLength(1);
    expectNoReplay(result);
  });
  it.each(["auth", "reply", "fallback"] as const)("refuses the OLD serialized proof after SDK branch replacement at %s", async boundary => {
    const result = await composition({ boundary });
    expect(result.execution.outcome).toBe("fail");
    expect(result.execution.error).toMatchObject({ kind: "transport", retryable: false, message: expect.stringContaining("retained evidence or ownership changed") });
    expect(JSON.stringify(buildSessionContext(result.manager.getEntries(), result.manager.getLeafId()).messages)).toContain("Correction: score is 888");
    expect(scripted.calls).toHaveLength(boundary === "auth" ? 0 : 1);
    expectNoReplay(result);
  });
  for (const attempts of [0, 3]) {
    it.each([
      ["depth", { outcome: "answer", answer: { score: 777, extra: { a: { b: { c: { d: { e: 1 } } } } } } }],
      ["invalid-schema", { outcome: "answer", answer: { score: "not an integer" } }],
      ["malformed", { outcome: "abstain", answer: { score: 777 } }],
      ["abstain", { outcome: "abstain" }],
    ])("%s recovery failure never enters respond repair (attempts=" + attempts + ")", async (name, payload) => {
      const result = await composition({ payload, attempts });
      expect(result.execution.outcome).toBe("fail");
      expect(result.execution.error).toMatchObject({ kind: "transport", retryable: false, message: expect.stringContaining("finalization failed") });
      expect(result.ajvDepths, "metadata, abstain and business-depth failures precede actual AJV validation").toEqual(name === "invalid-schema" ? [true] : []);
      expect(scripted.calls).toHaveLength(1);
      expectNoReplay(result);
    });
  }
});
