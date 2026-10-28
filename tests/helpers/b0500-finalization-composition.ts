// B0500 shared test-only production composition. The on-session lifecycle is
// scripted; SessionManager edits/projection, parser, producer, executor, AJV,
// finalization gate and dispatcher are real. The live twin forwards complete()
// to the real provider. This is not a natural-overflow/host-timing witness.
import { expect } from "vitest";
import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import { SessionManager, buildSessionContext, type ExtensionAPI, type ExtensionCommandContext, type ModelRegistry, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../../src/extension/production-theta-producer";
import { executeBody } from "../../src/runtime/statement-executor";
import { FINALIZATION_TOOL_NAME } from "../../src/extension/off-session-finalization";
import { rootDouble, thetaInput } from "./scripted-live-session-harness";

export const B0500_QUERY = "Given input value 263, what is input plus 514? Return the total in the score field.";
export const B0500_OWN_ANSWER = "The input is 263. Adding 514 gives a total of 777.";
export const B0500_PRIOR_ANSWER = "B0500_UNRELATED_PRIOR_ANSWER: 222";
// Inline parser input only: no new shipped theta/child fixture or discovery path.
const SOURCE = `---\nmode: prompt\ntools:\n  - bash\n---\nschema Verdict { score: integer }\nlet answer = @<Verdict>\`${B0500_QUERY}\`?\nanswer\n`;

export function b0500Assistant(model: Model<Api>, text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: model.api, provider: model.provider, model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop", timestamp: 0 };
}

export async function driveB0500Composition(input: { readonly model: Model<Api>; readonly registry: ModelRegistry; readonly relocate: boolean }) {
  const manager = SessionManager.inMemory();
  manager.appendMessage({ role: "user", content: "What is 91 plus 131?", timestamp: 0 });
  const priorId = manager.appendMessage(b0500Assistant(input.model, B0500_PRIOR_ANSWER));
  const before = buildSessionContext(manager.getEntries(), manager.getLeafId()).messages;
  const sent: string[] = [];
  const notes: string[] = [];
  const registered: ToolDefinition[] = [];
  const activeWindows: string[][] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const abort = new AbortController();
  let active = ["bash"];
  let idle = true;
  let pending = false;
  let own: AssistantMessage | undefined;
  const pi = {
    sendUserMessage(text: string): void {
      expect(idle, "every scripted host run starts idle").toBe(true);
      sent.push(text);
      manager.appendMessage({ role: "user", content: text, timestamp: 0 });
      idle = false;
      pending = true;
    },
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => { active = [...names]; activeWindows.push([...names]); },
    registerTool: (tool: ToolDefinition) => { registered.push(tool); },
    on: () => () => {},
    sendMessage: (note: { customType: string; content: string; display: boolean; details?: unknown }) => {
      notes.push(note.content);
      manager.appendCustomMessageEntry(note.customType, note.content, note.display, note.details);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    model: input.model, signal: undefined, sessionManager: manager,
    isIdle: () => idle,
    waitForIdle: async () => { expect(idle).toBe(true); },
    abort: () => { idle = true; },
  } as unknown as ExtensionCommandContext;
  const root = rootDouble({ clock: {
    now: () => performance.now(), wallNow: () => Date.now(),
    setTimeout: (fn, ms) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (ms === 10 && pending) {
          pending = false;
          own = b0500Assistant(input.model, B0500_OWN_ANSWER);
          manager.appendMessage(own);
          // Edit ONLY prior history, after our completed answer exists. The
          // own user moves from index 2 to 1; own evidence is never edited.
          if (input.relocate) manager.appendContextEdit(priorId, null);
          idle = true;
        }
        fn();
      }, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); timers.delete(handle as ReturnType<typeof setTimeout>); },
  } });
  const theta = thetaInput(SOURCE, { slashName: "b0500composition", sourcePath: "/fixtures/b0500-inline.theta" });
  const producer = createProductionProducerDeps({ pi, root, modelRegistry: input.registry });
  const binding = producer.bindPromptConversation({ theta, args: "", ctx, thetaAbort: abort });
  try {
    expect(binding.drivenAgainst).toBe("prompt-user-session");
    const execution = await executeBody(theta.body, binding.executeDeps);
    const projected = buildSessionContext(manager.getEntries(), manager.getLeafId()).messages;
    expect(sent, "finalization must not restart execution or issue shared-session repair").toEqual([B0500_QUERY]);
    expect(idle).toBe(true);
    expect(own, "scripted attempt really committed its completed own answer").toBeDefined();
    expect(projected).toContain(own);
    const ownUserIndex = projected.findIndex(message => message.role === "user" && message.content === B0500_QUERY);
    expect(ownUserIndex).toBe(input.relocate ? before.length - 1 : before.length);
    const edits = manager.getEntries().filter(entry => entry.type === "context_edit");
    expect(edits).toHaveLength(input.relocate ? 1 : 0);
    if (input.relocate) {
      expect(edits[0]).toMatchObject({ targetId: priorId, replacement: null });
      expect(projected).not.toContain(before[1]);
      expect(notes.filter(note => note.includes("finalizing unavailable query output"))).toHaveLength(1);
    } else {
      expect(notes.filter(note => note.includes("finalizing unavailable query output"))).toHaveLength(0);
    }
    const persistedNotes = manager.getBranch().filter(entry => entry.type === "custom_message" && entry.customType === "theta-system-note");
    expect(persistedNotes.map(entry => entry.type === "custom_message" ? entry.content : "")).toEqual(notes);
    expect(notes.filter(note => /returned Err|cancelled|aborted/.test(note))).toEqual([]);
    expect(execution.outcome, "B0500_COMPOSITION: completed relocated typed output must finalize, not fail closed").toBe("success");
    expect(registered).toHaveLength(1);
    expect(registered[0]!.name).toMatch(/^__theta_respond_/);
    expect(activeWindows.some(names => names.includes("bash")), "operational tool is available on-session, not to the finalizer").toBe(true);
    expect(active).toEqual(["bash"]);
    expect(timers.size, "poll/deadline timers must be disposed").toBe(0);
    return { value: execution.result.value, toolName: registered[0]!.name, notes };
  } finally {
    abort.abort("test disposed");
    await binding.finishInvocation?.();
    for (const timer of timers) clearTimeout(timer);
  }
}

// Inspect only this test's synthetic fixture context, never auth/options,
// provider headers, or a user's persisted/live transcript. No context is logged.
export function expectB0500FinalizationContext(context: Context): void {
  expect(context.tools?.map(tool => tool.name), "fresh finalizer exposes ONLY the private answer/abstain submission").toEqual([FINALIZATION_TOOL_NAME]);
  expect(context.messages.map(message => message.role)).toEqual(["user"]);
  const message = context.messages[0]!;
  expect(message.role).toBe("user");
  const content = message.content;
  if (typeof content !== "string") throw new Error("B0500 fixture finalization requires serialized evidence text");
  expect(content).toContain("one-shot output finalization");
  expect(content).toContain('{"outcome":"abstain"}');
  expect(content).toContain('{"outcome":"answer","answer":');
  expect(content).not.toContain(B0500_PRIOR_ANSWER);
  const line = content.split("\n").find(part => part.startsWith('{"originalRenderedQuery":'));
  if (line === undefined) throw new Error("B0500 original query/evidence envelope missing");
  expect(JSON.parse(line)).toEqual({ originalRenderedQuery: B0500_QUERY,
    retainedEvidence: [{ role: "assistant", content: [{ type: "text", text: B0500_OWN_ANSWER }] }] });
  expect(content).toContain(FINALIZATION_TOOL_NAME);
  expect(context.tools?.[0]?.parameters).toMatchObject({
    required: ["outcome"], additionalProperties: false,
    properties: { outcome: { enum: ["answer", "abstain"] }, answer: { type: "object" } },
  });
}

export function expectB0500Score(value: unknown, expected = 263 + 514): void {
  expect(value, "B0500_FINALIZED_COMPUTATION: result must be the original input's total, not prior history or an absent answer").toEqual({ score: expected });
}
